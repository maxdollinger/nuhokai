import type { LoadedNode, LoadedWorld } from "../../load/load-world.ts";
import type { Finding } from "../diagnostics.ts";

/** The loaded world as the rule groups share it: its nodes, and the lookups by id that duplicate ids complicate. */
export interface WorldTree {
  readonly nodes: readonly LoadedNode[];
  /** Ids held by more than one reachable node, or by the world and a node: SpecCheck R1's, every other rule skips them. */
  readonly duplicated: ReadonlySet<string>;
  /** The node holding a unique id; undefined for a duplicated or unknown one. */
  byId(id: string): LoadedNode | undefined;
  /** Whether `ancestor` contains `node`, at any depth. */
  isAncestor(ancestor: LoadedNode, node: LoadedNode): boolean;
  /** The direct children of a node, or the top level for null, in walk order. */
  childrenOf(parent: number | null): readonly LoadedNode[];
}

/** The loaded world as a tree: each node under the parent LoadWorld placed it in, by position. */
export function worldTree(world: LoadedWorld): WorldTree {
  const nodes = world.nodes;
  const counts = new Map<string, number>([[world.id, 1]]);
  for (const node of nodes) counts.set(node.spec.id, (counts.get(node.spec.id) ?? 0) + 1);
  const duplicated = new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
  const unique = new Map(nodes.filter((node) => !duplicated.has(node.spec.id)).map((node) => [node.spec.id, node]));
  return {
    nodes,
    duplicated,
    byId: (id) => unique.get(id),
    isAncestor: (ancestor, node) => {
      for (let at = node.parent; at !== null; at = nodes[at]?.parent ?? null) if (at === ancestor.index) return true;
      return false;
    },
    childrenOf: (parent) =>
      (parent === null ? world.top : (nodes[parent]?.children ?? [])).flatMap((index) => nodes[index] ?? []),
  };
}

/** A finding's location: a file and its line when known, as a node or a listing holds them. */
export function at(place: { readonly file: string; readonly line?: number | undefined }): {
  file: string;
  line?: number;
} {
  return place.line === undefined ? { file: place.file } : { file: place.file, line: place.line };
}

/** An error about a node: at its node() line, named by its path. */
export function nodeError(node: LoadedNode, rule: string, fix: string): Finding {
  return { severity: "error", ...at(node), node: node.path, rule, fix };
}
