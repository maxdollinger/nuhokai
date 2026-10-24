import type {
  AsNodeUuid,
  CheckedContracts,
  CheckedRequirements,
  CheckedTestCases,
  ContractRef,
  DelegateIds,
  DelegatesDef,
  DelegateTargets,
  NodeDef,
  NodeDraft,
  NodeEdges,
  NodeHandle,
  NodeIdOf,
  NodeRules,
  NodeUuid,
  PortsDef,
  RequirementsDef,
  TestCasesDef,
} from "./types.ts";

/**
 * Declares a node in two steps. Export the result; the export name is the
 * node's display name. Where the node lives is not declared here but in the
 * world file (`defineWorld`, `relation`).
 *
 * ```ts
 * export const Orders = defineNode({
 *   id: "01a16dd2-bc14-752c-b0df-585621a330ab",
 *   purpose: "Owns orders from checkout to delivery.",
 *   status: "planned",
 *   source: [],
 *   ports: { place: { kind: "call", purpose: "Place an order" } },
 * }).edges({
 *   uses: () => [Stock.reserve],
 * });
 * ```
 *
 * `defineNode` takes the static fields and infers the handle's type from them,
 * including `implements` and `delegate`, which only point at contracts and
 * direct children; `.edges()` takes `uses` and is not generic, so the handle's
 * type never depends on a node that could point back, and files may reference
 * each other in cycles without annotations. Edges are functions so that
 * modules may import each other in cycles: only the loader calls them, after
 * every module has been evaluated. A node without edges still calls `.edges({})`.
 */
export function defineNode<
  const P extends PortsDef = Record<never, never>,
  const External extends boolean = false,
  const Abstract extends boolean = false,
  const Id extends string = NodeUuid,
  const Contracts extends readonly ContractRef[] = readonly [],
  const D extends DelegatesDef = Record<never, never>,
  const R extends RequirementsDef = readonly [],
  const T extends TestCasesDef = readonly [],
>(
  def: NodeDef<
    P,
    External,
    Abstract,
    Id,
    CheckedContracts<Contracts>,
    D,
    CheckedRequirements<R>,
    CheckedTestCases<T, R>
  > &
    NodeRules<P, External, Abstract, Id, Contracts, D>,
): NodeDraft<P, External, Abstract, AsNodeUuid<Id>, NodeIdOf<Contracts[number]>, DelegateTargets<D>> {
  return Object.freeze({
    $ref: "draft",
    edges: (edges: NodeEdges) => createHandle(def as NodeDef, edges),
  }) as unknown as NodeDraft<P, External, Abstract, AsNodeUuid<Id>, NodeIdOf<Contracts[number]>, DelegateTargets<D>>;
}

function createHandle(
  def: NodeDef,
  edges: NodeEdges,
): NodeHandle<PortsDef, boolean, boolean, NodeUuid, NodeUuid, DelegateIds> {
  const $def = frozenCopy({ ...def, ...edges });
  const handle = { $ref: "node", $def };
  // defineProperty, not assignment: a port named `__proto__` would otherwise set the prototype.
  for (const [name, port] of Object.entries($def.ports ?? {})) {
    const ref = Object.freeze({ $ref: "port", kind: port.kind, node: handle, name });
    Object.defineProperty(handle, name, { value: ref, enumerable: true });
  }
  return Object.freeze(handle) as unknown as NodeHandle<PortsDef, boolean, boolean, NodeUuid, NodeUuid, DelegateIds>;
}

/** Deep copy with every object and array frozen. Functions (the lazy edges) are kept as they are. */
function frozenCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy)) as T;
  if (typeof value !== "object" || value === null) return value;
  // fromEntries defines properties, so keys like `__proto__` stay plain data.
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)]))) as T;
}
