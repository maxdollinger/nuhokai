import type { LoadedWorld } from "../load/load-world.ts";
import { CliError } from "./failure.ts";

/** The world's shape NodePath reads: names and parents by position, as LoadWorld answers them. */
export type Hierarchy = Pick<LoadedWorld, "nodes" | "parents">;

/**
 * Each node's hierarchy path, in `nodes` order: the names from the top level down, joined with `/`
 * (`Check/SpecCheck`), a top-level node's path its name alone. Built from parents by position, never by id,
 * so duplicate ids cannot misplace a node.
 */
export function nodePaths(world: Hierarchy): string[] {
  const paths: string[] = [];
  world.nodes.forEach((spec, index) => {
    const parent = world.parents[index] ?? null;
    // A parent comes before its children, so its path is already there.
    paths.push(parent === null ? spec.name : `${paths[parent]}/${spec.name}`);
  });
  return paths;
}

/** Each node's direct children by position, the top level under null, in walk order. */
export function childrenOf(world: Hierarchy): Map<number | null, number[]> {
  const children = new Map<number | null, number[]>();
  world.parents.forEach((parent, index) => {
    const key = parent ?? null;
    const list = children.get(key);
    if (list) list.push(index);
    else children.set(key, [index]);
  });
  return children;
}

/**
 * The position in `nodes` of the node a typed hierarchy path names: exact and case-sensitive, one segment at a
 * time from the top level; one trailing `/` allowed, as Tree prints a collapsed dome. Otherwise one CliError
 * naming the closest match (the rest of the path corrected as far as it goes), or the command listing the
 * deepest node found; two siblings sharing a segment's name are one CliError naming nuhokai check. Commands in
 * a message carry `--path <root>` unless `root` is the cwd, so they run as printed.
 */
export function findNode(world: Hierarchy, typed: string, root: string): number {
  const command = (name: string, ...args: string[]) =>
    `\`${["nuhokai", name, ...args, ...(root === "." ? [] : ["--path", root])].map(shellWord).join(" ")}\``;
  const path = typed.endsWith("/") ? typed.slice(0, -1) : typed;
  const segments = path.split("/");
  if (path === "" || segments.some((segment) => segment === "")) {
    throw new CliError(
      `no node '${typed}'; a node path is names joined by single /, as ${command("tree")} prints them`,
    );
  }
  const paths = nodePaths(world);
  const children = childrenOf(world);
  let parent: number | null = null;
  for (const [depth, segment] of segments.entries()) {
    const siblings: number[] = children.get(parent) ?? [];
    const matches: number[] = siblings.filter((index) => world.nodes[index]?.name === segment);
    if (matches.length > 1) {
      const here = segments.slice(0, depth + 1).join("/");
      throw new CliError(`'${here}' names ${matches.length} siblings; ${command("check")} reports the clash`);
    }
    const [match] = matches;
    if (match !== undefined) {
      parent = match;
      continue;
    }
    if (paths.includes(path)) {
      throw new CliError(`no node '${typed}': a name on it holds /, which a node path cannot address; rename the node`);
    }
    const above = parent === null ? undefined : paths[parent];
    const nameOf = (index: number) => world.nodes[index]?.name ?? "";
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
      const below = at === undefined ? [] : (children.get(at) ?? []);
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

/** A word as a shell reads it back: unchanged when plain, else single-quoted. */
function shellWord(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
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
