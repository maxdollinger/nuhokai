import type { NodeSpec } from "@nuhokai/world/node-spec";
import type { LoadedWorld } from "../../load/load-world.ts";
import { childrenOf, nameNodes } from "../../shared/node-path.ts";

/** One reachable node, by its position in the loaded world's `nodes`. */
export interface TreeNode {
  readonly index: number;
  readonly spec: NodeSpec;
  /** Its parent's position, or null at the top level. */
  readonly parent: number | null;
  /** Its path from the world, `Check/SpecCheck`: how diagnostics name it. */
  readonly path: string;
  /** Its defining file, named from the cwd, and its node() line when known. */
  readonly file: string;
  readonly line?: number;
}

/** The loaded world as a tree the rule groups share: nodes by position, ids and paths. */
export interface WorldTree {
  readonly nodes: readonly TreeNode[];
  /** Ids held by more than one reachable node, or by the world and a node: SpecCheck R1's, every other rule skips them. */
  readonly duplicated: ReadonlySet<string>;
  /** The node holding a unique id; undefined for a duplicated or unknown one. */
  byId(id: string): TreeNode | undefined;
  /** Whether `ancestor` contains `node`, at any depth. */
  isAncestor(ancestor: TreeNode, node: TreeNode): boolean;
  /** The direct children of a node, or the top level for null, in walk order. */
  childrenOf(parent: number | null): readonly TreeNode[];
}

/** The loaded world as a tree: each node under the parent LoadWorld placed it in, by position. */
export function worldTree(world: LoadedWorld): WorldTree {
  // Diagnostics name a node as every command does: NodePath's hierarchy path.
  const paths = nameNodes(world);
  const nodes: TreeNode[] = world.nodes.map((spec, index) => {
    const file = world.files[index];
    return {
      index,
      spec,
      parent: world.parents[index] ?? null,
      path: paths[index] ?? "",
      file: file?.file ?? world.file,
      ...(file?.line === undefined ? {} : { line: file.line }),
    };
  });
  const children = childrenOf(world);
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
    childrenOf: (parent) => (children.get(parent) ?? []).flatMap((index) => nodes[index] ?? []),
  };
}

/** A finding's location: the node's entry in the loaded world's files. */
export function at(node: TreeNode): { file: string; line?: number } {
  return node.line === undefined ? { file: node.file } : { file: node.file, line: node.line };
}
