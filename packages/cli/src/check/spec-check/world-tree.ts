import type { NodeSpec } from "@nuhokai/world/node-spec";
import type { LoadedWorld } from "../../load/load-world.ts";

/**
 * Where world-level findings point (SpecCheck DataRules R3, SourceRules R3): the spec names the world file as
 * `nuhokai/index.ts`, and no rule group has the world folder's path (WorldPath.file is not among their edges), so the
 * name stays literal. Correct for the cwd; under --path it lacks the project directory (reported as a spec gap).
 */
export const WORLD_FILE = "nuhokai/index.ts";

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

/**
 * Rebuild the tree from the loaded world: `nodes` is depth-first with a parent before its children, so a node's
 * parent is on the path to the node before it, the deepest one there with its parent id.
 */
export function worldTree(world: LoadedWorld): WorldTree {
  const nodes: TreeNode[] = [];
  const stack: TreeNode[] = [];
  world.nodes.forEach((spec, index) => {
    if (spec.parent === null) stack.length = 0;
    else while (stack.length && stack.at(-1)?.spec.id !== spec.parent) stack.pop();
    const parent = stack.at(-1) ?? null;
    const file = world.files[index];
    const node: TreeNode = {
      index,
      spec,
      parent: parent ? parent.index : null,
      path: parent ? `${parent.path}/${spec.name}` : spec.name,
      file: file?.file ?? WORLD_FILE,
      ...(file?.line === undefined ? {} : { line: file.line }),
    };
    nodes.push(node);
    stack.push(node);
  });
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
    childrenOf: (parent) => nodes.filter((node) => node.parent === parent),
  };
}

/** A finding's location: the node's entry in the loaded world's files. */
export function at(node: TreeNode): { file: string; line?: number } {
  return node.line === undefined ? { file: node.file } : { file: node.file, line: node.line };
}
