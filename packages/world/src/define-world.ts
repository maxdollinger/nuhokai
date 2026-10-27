import type { NodeId, World, WorldChildrenRules } from "./types.ts";

/**
 * The world: its id and every top-level node. A repo's `nuhokai/index.ts`
 * default-exports it, and it is the loader's only entry point: the world
 * contains exactly the nodes reachable from here. Nodes list their own
 * children, so there are no relation objects.
 *
 * ```ts
 * export default defineWorld({ id: "01a17bb6-ad4d-7298-8492-a53237d45f80", children: [Postgres, AuditLog, Shop] });
 * ```
 *
 * The id has a node id's form; tools key per-world state by it. External
 * nodes are only allowed here, at the top level.
 */
export function defineWorld<const Children extends readonly unknown[]>(world: {
  readonly id: NodeId;
  readonly children: Children & NoInfer<WorldChildrenRules<Children>>;
}): World {
  return Object.freeze({
    $ref: "world",
    id: world.id,
    children: Object.freeze([...world.children]),
  }) as unknown as World;
}
