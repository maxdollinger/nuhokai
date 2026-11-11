import { CliError } from "./failure.ts";
import { suggestedCommand } from "./world-path.ts";

/** A node as the hierarchy knows it, by position: its name, parent, children and path. LoadWorld's nodes are these. */
export interface HierarchyNode {
  readonly index: number;
  readonly spec: { readonly name: string };
  readonly parent: number | null;
  readonly children: readonly number[];
  readonly path: string;
}

/** A world's hierarchy: its nodes by position, and the top level's positions. */
export interface Hierarchy<N extends HierarchyNode = HierarchyNode> {
  readonly nodes: readonly N[];
  readonly top: readonly number[];
}

/** The direct children of a node, or the top level for null, in list order. */
export function childrenOf<N extends HierarchyNode>(world: Hierarchy<N>, parent: number | null): N[] {
  const positions = parent === null ? world.top : (world.nodes[parent]?.children ?? []);
  return positions.flatMap((index) => world.nodes[index] ?? []);
}

/** Whether `ancestor` contains `node`, at any depth. */
export function isAncestor(world: Hierarchy, ancestor: HierarchyNode, node: HierarchyNode): boolean {
  for (let at = node.parent; at !== null; at = world.nodes[at]?.parent ?? null) if (at === ancestor.index) return true;
  return false;
}

/**
 * Each node's hierarchy path, in the order given: the names from the top level down, joined with `/`
 * (`Check/SpecCheck`), a top-level node's path its name alone. Built from parents by position, never by id,
 * so duplicate ids cannot misplace a node; a parent comes before its children.
 */
export function nameNodes(nodes: readonly { readonly name: string; readonly parent: number | null }[]): string[] {
  const paths: string[] = [];
  for (const { name, parent } of nodes) paths.push(parent === null ? name : `${paths[parent]}/${name}`);
  return paths;
}

/**
 * The position in `nodes` of the node a typed hierarchy path names: exact and case-sensitive, one segment at a
 * time from the top level; one trailing `/` allowed, as Tree prints a collapsed dome. Otherwise one CliError: at
 * the first segment that matches nothing, the closest sibling's name with the rest of the path as typed, suggested
 * as `nuhokai <command> <path>`, else `nuhokai tree` listing the deepest node found; two siblings sharing a
 * segment's name are one CliError naming nuhokai check. Commands in a message carry `--path <root>` unless `root`
 * is the cwd, so they run as printed.
 */
export function findNode(world: Hierarchy, typed: string, root: string, asked: string): number {
  const command = (name: string, ...args: string[]) => suggestedCommand(name, args, root);
  const path = typed.endsWith("/") ? typed.slice(0, -1) : typed;
  const segments = path.split("/");
  if (path === "" || segments.some((segment) => segment === "")) {
    throw new CliError(
      `no node '${typed}'; a node path is names joined by single /, as ${command("tree")} prints them`,
    );
  }
  let parent: HierarchyNode | undefined;
  for (const [depth, segment] of segments.entries()) {
    const siblings = childrenOf(world, parent?.index ?? null);
    const matches = siblings.filter((node) => node.spec.name === segment);
    if (matches.length > 1) {
      const here = segments.slice(0, depth + 1).join("/");
      throw new CliError(`'${here}' names ${matches.length} siblings; ${command("check")} reports the clash`);
    }
    const [match] = matches;
    if (match !== undefined) {
      parent = match;
      continue;
    }
    if (world.nodes.some((node) => node.path === path)) {
      throw new CliError(`no node '${typed}': a name on it holds /, which a node path cannot address; rename the node`);
    }
    const closest = closestName(
      segment,
      siblings.map((node) => node.spec.name),
    );
    if (closest === undefined) {
      const list =
        parent === undefined
          ? `${command("tree")} lists the top level`
          : `${command("tree", parent.path)} lists its children`;
      throw new CliError(`no node '${typed}'; ${list}`);
    }
    const corrected = [...(parent === undefined ? [] : [parent.path]), closest, ...segments.slice(depth + 1)];
    throw new CliError(`no node '${typed}'; did you mean ${command(asked, corrected.join("/"))}?`);
  }
  // segments is never empty, so the loop chose a node.
  return (parent as HierarchyNode).index;
}

/**
 * The name closest to a segment that matched nothing: one equal ignoring case, else the smallest edit distance
 * (ignoring case) up to a third of the segment's length; ties in walk order. Undefined when none is close.
 */
function closestName(segment: string, names: readonly string[]): string | undefined {
  const wanted = segment.toLowerCase();
  const sameCase = names.find((name) => name.toLowerCase() === wanted);
  if (sameCase !== undefined) return sameCase;
  const limit = Math.floor(segment.length / 3);
  let best: { name: string; distance: number } | undefined;
  for (const name of names) {
    const distance = editDistance(wanted, name.toLowerCase());
    if (distance <= limit && (best === undefined || distance < best.distance)) best = { name, distance };
  }
  return best?.name;
}

/** Levenshtein distance: insertions, deletions and substitutions, one each. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
