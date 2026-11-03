import type { LoadedWorld } from "../load/load-world.ts";
import { CliError } from "./failure.ts";
import { suggestedCommand } from "./paths.ts";

/** The world's shape findNode reads: each node's name, path and children, and the top level, as LoadWorld answers them. */
export type Hierarchy = Pick<LoadedWorld, "nodes" | "top">;

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
 * time from the top level; one trailing `/` allowed, as Tree prints a collapsed dome. Otherwise one CliError
 * naming the closest match (the rest of the path corrected as far as it goes), or the command listing the
 * deepest node found; two siblings sharing a segment's name are one CliError naming nuhokai check. Commands in
 * a message carry `--path <root>` unless `root` is the cwd, so they run as printed.
 */
export function findNode(world: Hierarchy, typed: string, root: string): number {
  const command = (name: string, ...args: string[]) => suggestedCommand(name, args, root);
  const path = typed.endsWith("/") ? typed.slice(0, -1) : typed;
  const segments = path.split("/");
  if (path === "" || segments.some((segment) => segment === "")) {
    throw new CliError(
      `no node '${typed}'; a node path is names joined by single /, as ${command("tree")} prints them`,
    );
  }
  const childrenOf = (parent: number | null) => (parent === null ? world.top : (world.nodes[parent]?.children ?? []));
  const nameOf = (index: number) => world.nodes[index]?.spec.name ?? "";
  let parent: number | null = null;
  for (const [depth, segment] of segments.entries()) {
    const siblings = childrenOf(parent);
    const matches = siblings.filter((index) => nameOf(index) === segment);
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
    const above = parent === null ? undefined : world.nodes[parent]?.path;
    const closest = closestName(segment, siblings.map(nameOf));
    if (closest === undefined) {
      const list =
        above === undefined ? `${command("tree")} lists the top level` : `${command("tree", above)} lists its children`;
      throw new CliError(`no node '${typed}'; ${list}`);
    }
    // Correct the rest of the path too, as far as each segment has an equal or close name.
    let corrected = above === undefined ? closest : `${above}/${closest}`;
    let at = siblings.find((index) => nameOf(index) === closest);
    for (const next of segments.slice(depth + 1)) {
      const below = at === undefined ? [] : childrenOf(at);
      const names = below.map(nameOf);
      const name = names.includes(next) ? next : closestName(next, names);
      if (name === undefined) break;
      corrected = `${corrected}/${name}`;
      at = below.find((index) => nameOf(index) === name);
    }
    throw new CliError(`no node '${typed}'; did you mean '${corrected}'?`);
  }
  // segments is never empty, so the loop chose a node.
  return parent as number;
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
