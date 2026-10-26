import type { World, WorldChildrenRules } from "./types.ts";

/**
 * The world: every top-level node. A repo's `nuhokai/index.ts` default-exports
 * it, and it is the loader's only entry point: the world contains exactly the
 * nodes reachable from here. Nodes list their own children, so there are no
 * relation objects.
 *
 * ```ts
 * export default defineWorld({ children: [Postgres, AuditLog, Shop] });
 * ```
 *
 * External nodes are only allowed here, at the top level.
 */
export function defineWorld<const Children extends readonly unknown[]>(world: {
  readonly children: Children & NoInfer<WorldChildrenRules<Children>>;
}): World {
  return Object.freeze({ $ref: "world", children: Object.freeze([...world.children]) }) as unknown as World;
}
