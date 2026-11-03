import type { LoadedNode, LoadedWorld } from "../../load/load-world.ts";

/** The loaded world's ids as the rules see them: which are duplicated, and the node behind each unique one. */
export interface Ids {
  /** Ids held by more than one reachable node, or by the world and a node: SpecCheck R1's, every other rule skips them. */
  readonly duplicated: ReadonlySet<string>;
  /** The node holding a unique id; undefined for a duplicated or unknown one. */
  byId(id: string): LoadedNode | undefined;
}

/** The ids of a loaded world, the world's own counted. */
export function idsOf(world: LoadedWorld): Ids {
  const counts = new Map<string, number>([[world.id, 1]]);
  for (const node of world.nodes) counts.set(node.spec.id, (counts.get(node.spec.id) ?? 0) + 1);
  const duplicated = new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
  const unique = new Map(
    world.nodes.filter((node) => !duplicated.has(node.spec.id)).map((node) => [node.spec.id, node]),
  );
  return { duplicated, byId: (id) => unique.get(id) };
}
