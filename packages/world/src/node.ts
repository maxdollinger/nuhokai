import type {
  CheckedContracts,
  CheckedRequirements,
  CheckedTestCases,
  ChildNodes,
  ContractRef,
  DomePortRef,
  IsDome,
  NodeDraft,
  NodeEdges,
  NodeHandle,
  NodeId,
  NodeIdOf,
  NodeRef,
  NodeShape,
  NodeShapeRules,
  PortKind,
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
 *   children: () => ({ orders: Orders }),
 *   ports: (c) => ({ placeOrder: c.orders.ports.place }),
 * }).edges({});
 * ```
 *
 * `node` takes the static fields and infers the handle's type, including
 * `implements` and `children`, which only point at contracts and direct
 * children. Both are functions: `children` is read when the dome is first used
 * (its `$def.children`, `$def.ports` or a port's `kind`), so a dome may sit in an
 * import cycle with its children; its `ports` runs at once against stand-ins for
 * the children, which gives the handle its port names; `.edges()` takes `uses` and is not generic, so the handle's type
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
  const fields: Record<string, unknown> = {};
  // defineProperty, not assignment: keys like `__proto__` stay plain data.
  for (const [key, value] of Object.entries({ ...rest, ...edges })) {
    Object.defineProperty(fields, key, { value: frozenCopy(value), enumerable: true });
  }

  const handle = { $ref: "node" } as { $ref: "node"; $def: StoredNodeDef & NodeEdges } & Record<string, unknown>;
  let portNames: string[];
  let kindOf: (name: string) => PortKind;
  if (children !== undefined) {
    if (typeof children !== "function") {
      throw new TypeError("`children` is a function returning the children record: `children: () => ({ … })`");
    }
    const exposed = typeof ports === "function" ? domePortsOf(ports as (c: unknown) => unknown) : undefined;
    const dome = lazyDome(children as () => unknown, exposed);
    Object.defineProperty(fields, "children", { get: () => dome().children, enumerable: true });
    if (exposed) Object.defineProperty(fields, "ports", { get: () => dome().ports, enumerable: true });
    portNames = Object.keys(exposed ?? {});
    kindOf = (name) => (dome().ports[name] as StoredWorldPort).kind;
  } else {
    if (ports !== undefined) Object.defineProperty(fields, "ports", { value: frozenCopy(ports), enumerable: true });
    const own = (fields.ports ?? {}) as PortsDef;
    portNames = Object.keys(own);
    kindOf = (name) => (own[name] as StoredWorldPort).kind;
  }
  handle.$def = Object.freeze(fields) as unknown as StoredNodeDef & NodeEdges;

  const portRefs: Record<string, unknown> = {};
  Object.defineProperty(handle, "ports", { value: portRefs, enumerable: true });
  for (const name of portNames) {
    if (name === "ports" || name.startsWith("$")) {
      throw new TypeError(`\`${name}\` is reserved for the handle's own properties`);
    }
    // A dome port's kind is its child port's, known once the dome is resolved; a leaf's is known now.
    const ref = Object.freeze(
      Object.defineProperties(
        {},
        {
          $ref: { value: "port", enumerable: true },
          kind:
            children === undefined
              ? { value: kindOf(name), enumerable: true }
              : { get: () => kindOf(name), enumerable: true },
          node: { value: handle, enumerable: true },
          name: { value: name, enumerable: true },
        },
      ),
    );
    // defineProperty, not assignment: a port named `__proto__` would otherwise set the prototype.
    Object.defineProperty(portRefs, name, { value: ref, enumerable: true });
    Object.defineProperty(handle, name, { value: ref, enumerable: true });
  }
  Object.freeze(portRefs);
  return Object.freeze(handle) as unknown as NodeHandle<PortKinds, boolean, boolean, NodeId, NodeId>;
}

/** Marks a stand-in for a direct child; its value is the child's name in the dome's `children`. */
const STAND_IN = Symbol("nuhokai.child");

/**
 * A dome's ports function, called once with stand-ins for its children: `c.orders.ports.place` (or
 * `c.orders.place`) is a port reference to the stand-in for `orders`. That gives the port names now,
 * without reading the children, which may not exist yet in an import cycle.
 */
function domePortsOf(ports: (c: unknown) => unknown): Readonly<Record<string, DomePortRef>> {
  const standIns = new Map<string, object>();
  const c = new Proxy(
    {},
    {
      get(_, key) {
        if (typeof key !== "string") return undefined;
        const known = standIns.get(key);
        if (known) return known;
        const child = standInChild(key);
        standIns.set(key, child);
        return child;
      },
    },
  );
  const exposed = ports(c);
  if (typeof exposed !== "object" || exposed === null) {
    throw new TypeError("a dome's `ports` returns a record of its children's ports");
  }
  return exposed as Readonly<Record<string, DomePortRef>>;
}

function standInChild(childName: string): object {
  const refs = new Map<string, object>();
  const portRef = (name: string) => {
    const known = refs.get(name);
    if (known) return known;
    const ref = Object.freeze({ $ref: "port", node: child, name });
    refs.set(name, ref);
    return ref;
  };
  const ports = new Proxy({}, { get: (_, key) => (typeof key === "string" ? portRef(key) : undefined) });
  const child: object = new Proxy(
    {},
    {
      get(_, key) {
        if (key === STAND_IN) return childName;
        if (key === "$ref") return "node";
        if (key === "ports") return ports;
        return typeof key === "string" ? portRef(key) : undefined;
      },
    },
  );
  return child;
}

/**
 * The dome's children and ports, resolved on first use and then kept: the children record is read, and each
 * port the ports function exposed is checked against it and copied from the child port, with its delegate.
 */
function lazyDome(
  children: () => unknown,
  exposed: Readonly<Record<string, DomePortRef>> | undefined,
): () => { children: ChildNodes; ports: StoredPortsDef } {
  let resolved: { children: ChildNodes; ports: StoredPortsDef } | undefined;
  let resolving = false;
  return () => {
    if (resolved) return resolved;
    if (resolving) throw new TypeError("a dome exposes a port of itself through its descendants");
    resolving = true;
    try {
      const record = children();
      if (typeof record !== "object" || record === null || Array.isArray(record)) {
        throw new TypeError("`children` does not return a record of nodes");
      }
      const childNodes = Object.freeze(
        Object.fromEntries(Object.entries(record).map(([name, child]) => [name, child])),
      ) as ChildNodes;
      resolved = { children: childNodes, ports: resolveDomePorts(exposed ?? {}, childNodes) };
      return resolved;
    } finally {
      resolving = false;
    }
  };
}

/**
 * Turns a dome's `ports` mapping into node-spec port definitions. Each own port
 * copies the direct child port's definition and records the child it delegates
 * to, so the loader can follow the reference by identity. A port reference names
 * its child through a stand-in (by name) or the child's handle (by identity).
 */
function resolveDomePorts(ports: Readonly<Record<string, DomePortRef>>, children: ChildNodes): StoredPortsDef {
  const resolved: Record<string, StoredWorldPort> = {};
  for (const [name, ref] of Object.entries(ports)) {
    const child = childOf(ref, children);
    if (!child) {
      throw new TypeError(`\`${name}\` exposes a port of a node that is not one of this dome's direct children`);
    }
    const port = ref.$ref === "inherited" ? ref.port.name : ref.name;
    const source = ref.$ref === "inherited" ? ref.port.node.$def.ports?.[port] : child.$def.ports?.[port];
    if (!source) throw new TypeError(`\`${port}\` is not a port of its node`);
    // defineProperty, not assignment: a port named `__proto__` would otherwise set the prototype.
    Object.defineProperty(resolved, name, {
      value: frozenCopy({ ...source, delegate: { to: child.$def.id, port } }),
      enumerable: true,
    });
  }
  return Object.freeze(resolved) as StoredPortsDef;
}

/** The direct child a dome port reference points at, or undefined. */
function childOf(ref: DomePortRef, children: ChildNodes): NodeRef | undefined {
  const node = (ref as { readonly node?: unknown } | null)?.node;
  const name = typeof node === "object" && node !== null ? (node as { [STAND_IN]?: unknown })[STAND_IN] : undefined;
  const child = typeof name === "string" ? (Object.hasOwn(children, name) ? children[name] : undefined) : node;
  return isNodeRef(child) && (Object.values(children) as readonly NodeRef[]).includes(child) ? child : undefined;
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
