import type { LoadedWorld } from "../load/load-world.ts";
import { childrenOf, nodePaths } from "../shared/node-path.ts";
import { inProject } from "../shared/paths.ts";

/** What a node without source prints in the source field. */
const NO_SOURCE = "(none)";

/**
 * The tree's lines, one per node in walk order: `path | source | purpose`. Without a start, the top-level nodes
 * and their descendants down to `level` (a top-level node counting as 1); with one, the start itself, then its
 * descendants down to `level` below it. `level` 0 prints every descendant. A printed dome whose children are not
 * printed shows `/ (<n>)` after its path. Sources are named from the cwd through the project directory `root`.
 */
export function renderTree(world: LoadedWorld, root: string, start: number | null, level: number): string[] {
  const paths = nodePaths(world);
  const children = childrenOf(world);

  const lines: string[] = [];
  const visit = (index: number, depth: number) => {
    const below = children.get(index) ?? [];
    const open = level === 0 || depth < level;
    const collapsed = below.length > 0 && !open;
    lines.push(line(world, root, index, `${paths[index]}${collapsed ? `/ (${below.length})` : ""}`));
    if (open) for (const child of below) visit(child, depth + 1);
  };
  if (start === null) for (const top of children.get(null) ?? []) visit(top, 1);
  else visit(start, 0);
  return lines;
}

/** One node's line; an unchecked world's odd fields print as best they can, never crash. */
function line(world: LoadedWorld, root: string, index: number, path: string): string {
  const spec = world.nodes[index];
  const entries = Array.isArray(spec?.source) ? spec.source.filter((entry) => typeof entry === "string") : [];
  const source = entries.length > 0 ? entries.map((entry) => inProject(root, entry)).join(", ") : NO_SOURCE;
  const purpose = typeof spec?.purpose === "string" ? spec.purpose : "";
  return [path, source, purpose].map(oneLine).join(" | ");
}

/**
 * A field on one line: every run of whitespace or control characters (newlines, escape sequences) is one space,
 * trimmed, so one node is always one line and nothing in a world file can reach the terminal as a control code.
 */
function oneLine(field: string): string {
  return field.replace(/[\s\p{Cc}]+/gu, " ").trim();
}
