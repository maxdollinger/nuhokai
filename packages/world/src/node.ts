import type {
  CheckedContracts,
  CheckedRequirements,
  CheckedTestCases,
  ChildNodes,
  ContractRef,
  DomePortRef,
  DomePortsDef,
  IsDome,
  NodeDraft,
  NodeEdges,
  NodeHandle,
  NodeId,
  NodeIdOf,
  NodeRef,
  NodeShape,
  NodeShapeRules,
  PortKinds,
  PortsDef,
  PortsOfShape,
  RequirementsDef,
  StoredNodeDef,
  StoredPortsDef,
  StoredWorldPort,
  TestCasesDef,
} from "./types.ts";

/** The broad shape the implementation sees after the generic signature has checked it. */
type NodeDefinition = NodeShape<
  Record<string, unknown> | undefined,
  Record<string, unknown>,
  boolean,
  boolean,
  NodeId,
  readonly ContractRef[]
>;

/**
 * Declares a node. Export the result; the export name is the node's display
 * name. A node without children is a leaf and declares its own ports; a node
 * with children is a dome, a pure container whose behavior is its children.
 *
 * ```ts
 * export const Orders = node({
 *   id: "01a16dd2-bc14-752c-b0df-585621a330ab",
 *   purpose: "Owns orders from checkout to delivery.",
 *   status: "planned",
 *   source: [],
 *   ports: { place: { kind: "call", purpose: "Place an order" } },
 * }).edges({
 *   uses: () => [Stock.reserve],
 * });
 *
 * export const Shop = node({
 *   id: "01a16dd2-bc14-752c-b0df-585621a330ac",
 *   purpose: "The shop backend.",
 *   status: "planned",
 *   source: [],
 *   children: { orders: Orders },
 *   ports: (c) => ({ placeOrder: c.orders.ports.place }),
 * }).edges({});
 * ```
 *
 * `node` takes the static fields and infers the handle's type, including
 * `implements` and `children`, which only point at contracts and direct
 * children; `.edges()` takes `uses` and is not generic, so the handle's type
 * never depends on a node that could point back, and files may reference each
 * other in cycles without annotations. Edges are functions so that modules may
 * import each other in cycles: only the loader calls them, after every module
 * has been evaluated. A node without edges still calls `.edges({})`.
 */
export function node<
  const C extends Record<string, unknown> | undefined = undefined,
  const P extends Record<string, unknown> = Record<never, never>,
  const External extends boolean = false,
  const Abstract extends boolean = false,
  const Id extends NodeId = NodeId,
  const Contracts extends readonly ContractRef[] = readonly [],
  const R extends RequirementsDef = readonly [],
  const T extends TestCasesDef = readonly [],
>(
  def: NodeShape<
    C,
    P,
    External,
    Abstract,
    Id,
    CheckedContracts<Contracts>,
    CheckedRequirements<R>,
    CheckedTestCases<T, R>
  > &
    NodeShapeRules<C, P, External, Abstract, Contracts>,
): NodeDraft<PortsOfShape<C, P>, External, Abstract, Id, NodeIdOf<Contracts[number]>, IsDome<C>>;
export function node(def: NodeDefinition): NodeDraft<PortKinds, boolean, boolean, NodeId, NodeId, boolean> {
  return Object.freeze({
    $ref: "draft",
    edges: (edges: NodeEdges) => createHandle(def, edges),
  }) as unknown as NodeDraft<PortKinds, boolean, boolean, NodeId, NodeId, boolean>;
}

function createHandle(def: NodeDefinition, edges: NodeEdges): NodeHandle<PortKinds, boolean, boolean, NodeId, NodeId> {
  const { children, ports, ...rest } = def;
  const stored: Record<string, unknown> = { ...rest };

  if (children !== undefined) {
    const childNodes = Object.freeze(
      Object.fromEntries(Object.entries(children).map(([name, child]) => [name, child])),
    ) as ChildNodes;
    stored.children = childNodes;
    if (typeof ports === "function") {
      stored.ports = resolveDomePorts(ports(childNodes) as DomePortsDef, childNodes);
    }
  } else if (ports !== undefined) {
    stored.ports = ports as unknown as PortsDef;
  }

  const $def = frozenCopy({ ...stored, ...edges }) as StoredNodeDef & NodeEdges;
  const handle = { $ref: "node", $def } as { $ref: "node"; $def: StoredNodeDef & NodeEdges } & Record<string, unknown>;
  const portRefs: Record<string, unknown> = {};
  Object.defineProperty(handle, "ports", { value: portRefs, enumerable: true });
  for (const [name, port] of Object.entries($def.ports ?? {})) {
    if (name === "ports" || name.startsWith("$")) {
      throw new TypeError(`\`${name}\` is reserved for the handle's own properties`);
    }
    const ref = Object.freeze({ $ref: "port", kind: port.kind, node: handle, name });
    // defineProperty, not assignment: a port named `__proto__` would otherwise set the prototype.
    Object.defineProperty(portRefs, name, { value: ref, enumerable: true });
    Object.defineProperty(handle, name, { value: ref, enumerable: true });
  }
  Object.freeze(portRefs);
  return Object.freeze(handle) as unknown as NodeHandle<PortKinds, boolean, boolean, NodeId, NodeId>;
}

/**
 * Turns a dome's `ports` mapping into MAX-5 port definitions. Each own port
 * copies the direct child port's definition and records the child it delegates
 * to, so the loader can follow the reference by identity.
 */
function resolveDomePorts(ports: DomePortsDef, children: ChildNodes): StoredPortsDef {
  const childNodes: readonly NodeRef[] = Object.values(children);
  const resolved: Record<string, StoredWorldPort> = {};
  for (const [name, ref] of Object.entries(ports)) {
    if (!childNodes.includes(ref.node)) {
      throw new TypeError(`\`${name}\` exposes a port of a node that is not one of this dome's direct children`);
    }
    const source = portDefinitionOf(ref);
    // defineProperty, not assignment: a port named `__proto__` would otherwise set the prototype.
    Object.defineProperty(resolved, name, { value: { ...source, delegate: portTargetOf(ref) }, enumerable: true });
  }
  return resolved as StoredPortsDef;
}

function portDefinitionOf(ref: DomePortRef): StoredWorldPort {
  const source = ref.$ref === "inherited" ? ref.port.node.$def.ports?.[ref.port.name] : ref.node.$def.ports?.[ref.name];
  if (!source) throw new TypeError(`\`${portNameOf(ref)}\` is not a port of its node`);
  return source;
}

function portNameOf(ref: DomePortRef): string {
  return ref.$ref === "inherited" ? ref.port.name : ref.name;
}

function portTargetOf(ref: DomePortRef): { to: NodeId; port: string } {
  return ref.$ref === "inherited"
    ? { to: ref.node.$def.id, port: ref.port.name }
    : { to: ref.node.$def.id, port: ref.name };
}

/** Deep copy with every object and array frozen. Node references and functions (lazy edges) are kept as they are. */
function frozenCopy<T>(value: T): T {
  if (isNodeRef(value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy)) as T;
  if (typeof value !== "object" || value === null) return value;
  // fromEntries defines properties, so keys like `__proto__` stay plain data.
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)]))) as T;
}

function isNodeRef(value: unknown): value is NodeRef {
  return typeof value === "object" && value !== null && (value as { readonly $ref?: unknown }).$ref === "node";
}
