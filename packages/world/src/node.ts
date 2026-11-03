import type {
  CheckedContracts,
  CheckedRequirements,
  CheckedTestCases,
  ContractRef,
  IsDome,
  NodeDraft,
  NodeId,
  NodeIdOf,
  NodeShape,
  NodeShapeRules,
  PortsOfShape,
  RequirementsDef,
  TestCasesDef,
} from "./types.ts";

/**
 * Declares a node. Export the result; the export name is the node's display
 * name. A node without children is a leaf and declares its own ports; a node
 * with children is a dome, a pure container whose behavior is its children:
 * it lists them and exposes some of their ports.
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
 *   children: [Orders],
 *   ports: { placeOrder: Orders.place },
 * }).edges({});
 * ```
 *
 * Declared only: world files are read by tools, never run. `node` takes the
 * static fields and infers the handle's type, including `implements` and
 * `children`, which only point at contracts and direct children; `.edges()`
 * takes `uses` and is not generic, so the handle's type never depends on a node
 * that could point back, and files may reference each other in cycles without
 * annotations. `uses` is a function so that two nodes in one file may use each
 * other: a plain list would read the later one before its declaration. A node
 * without edges still calls `.edges({})`.
 */
export declare function node<
  const C extends readonly unknown[] | undefined = undefined,
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
