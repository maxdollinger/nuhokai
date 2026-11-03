import type { NodeSpec } from "@nuhokai/world/node-spec";
import type { LoadedNode, LoadedWorld } from "../load/load-world.ts";
import { oneLine } from "../shared/failure.ts";
import { childrenOf } from "../shared/node-path.ts";
import { nameInProject } from "../shared/world-path.ts";

/** What a node without source prints in the source field. */
const NO_SOURCE = "(none)";

/**
 * The tree's lines, one per node in walk order: `path | source | purpose`. Without a start, the top-level nodes
 * and their descendants down to `level` (a top-level node counting as 1); with one, the start itself, then its
 * descendants down to `level` below it. `level` 0 prints every descendant. A printed dome whose children are not
 * printed shows `/ (<n>)` after its path. Sources are named from the cwd through the project directory `root`.
 */
export function renderTree(world: LoadedWorld, root: string, start: number | null, level: number): string[] {
  const lines: string[] = [];
  const visit = (node: LoadedNode | undefined, depth: number) => {
    if (!node) return;
    const open = level === 0 || depth < level;
    const collapsed = node.children.length > 0 && !open;
    lines.push(line(root, node.spec, `${node.path}${collapsed ? `/ (${node.children.length})` : ""}`));
    if (open) for (const child of childrenOf(world, node.index)) visit(child, depth + 1);
  };
  if (start === null) for (const top of childrenOf(world, null)) visit(top, 1);
  else visit(world.nodes[start], 0);
  return lines;
}

/** One node's line, each field on one line; an unchecked world's odd fields print as best they can, never crash. */
function line(root: string, spec: NodeSpec, path: string): string {
  const entries = Array.isArray(spec?.source) ? spec.source.filter((entry) => typeof entry === "string") : [];
  const source = entries.length > 0 ? entries.map((entry) => nameInProject(root, entry)).join(", ") : NO_SOURCE;
  const purpose = typeof spec?.purpose === "string" ? spec.purpose : "";
  return [path, source, purpose].map(oneLine).join(" | ");
}
