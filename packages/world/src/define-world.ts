import type { ChildrenRules, NodeIdOf, ParentRules, RelationRef, World } from "./types.ts";

/**
 * The world: every node, placed in one tree. A repo's `nuhokai/index.ts`
 * default-exports it, and it is the loader's only entry point: the world
 * contains exactly the nodes listed here.
 *
 * ```ts
 * export default defineWorld({
 *   children: [Postgres, AuditLog, relation({ parent: Shop, children: [Orders, Stock] })],
 * });
 * ```
 *
 * `children` takes nodes and `relation(...)` objects. External nodes are only
 * allowed here, at the top level.
 */
export function defineWorld<const Children extends readonly unknown[]>(world: {
  readonly children: Children & NoInfer<ChildrenRules<Children, "world">>;
}): World {
  return Object.freeze({ $ref: "world", children: Object.freeze([...world.children]) }) as unknown as World;
}

/**
 * A parent and its direct children, which are nodes or nested relations.
 * A subtree can be exported from its own file and composed:
 * `export const shop = relation({ parent: Shop, children: [Orders, Stock] })`.
 *
 * Fails to compile if the parent is external, abstract or has flags that are
 * not literals, if a child is external, or if the parent delegates to a node
 * that is not one of `children`.
 */
export function relation<const Parent, const Children extends readonly unknown[]>(spec: {
  readonly parent: Parent & NoInfer<ParentRules<Parent, Children>>;
  readonly children: Children & NoInfer<ChildrenRules<Children, "relation">>;
}): RelationRef<NodeIdOf<Parent>> {
  return Object.freeze({
    $ref: "relation",
    parent: spec.parent,
    children: Object.freeze([...spec.children]),
  }) as unknown as RelationRef<NodeIdOf<Parent>>;
}
