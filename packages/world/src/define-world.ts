import type { Blank, Forbidden, NodeId, World, WorldChildrenRules } from "./types.ts";

/**
 * The world: the outermost container, with its id, name, source and every top-level node. A repo's `nuhokai/index.ts`
 * default-exports it, and it is the loader's only entry point: the world
 * contains exactly the nodes reachable from here. Nodes list their own
 * children, so there are no relation objects.
 *
 * ```ts
 * export default defineWorld({
 *   id: "01a17bb6-ad4d-7298-8492-a53237d45f80",
 *   name: "Shop",
 *   source: ["src/**"],
 *   children: [Postgres, AuditLog, Shop],
 * });
 * ```
 *
 * The id has a node id's form; tools key per-world state by it. The name is
 * not blank. `source` is like a node's, relative to the project directory;
 * every node's `source` lies under it (check's rule). External nodes are only
 * allowed here, at the top level.
 */
export function defineWorld<const Name extends string, const Children extends readonly unknown[]>(world: {
  readonly id: NodeId;
  readonly name: Name & NoInfer<NameRule<Name>>;
  readonly description?: string;
  readonly source: readonly string[];
  readonly children: Children & NoInfer<WorldChildrenRules<Children>>;
}): World {
  return Object.freeze({
    $ref: "world",
    id: world.id,
    name: world.name,
    ...(world.description === undefined ? {} : { description: world.description }),
    // A cast can drop source; keep what was given and leave the verdict to check.
    source: Array.isArray(world.source) ? Object.freeze([...world.source]) : world.source,
    children: Object.freeze([...world.children]),
  }) as unknown as World;
}

/** A literal name must not be blank; a widened `string` is left to check. */
type NameRule<Name extends string> =
  Blank<Name> extends true ? Forbidden<"name must not be empty or whitespace"> : unknown;
