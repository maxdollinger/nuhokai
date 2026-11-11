import { loadWorld } from "../load/load-world.ts";
import { findNode } from "../shared/node-path.ts";
import { invalidFrom, ok, orFailed, type Report } from "../shared/report.ts";
import { renderTree } from "./tree-lines.ts";

/**
 * The tree command: load, find the start, render, report. Answers the node hierarchy of the world in the project
 * directory `root`, named from the cwd, from the node at hierarchy path `node` (else the top level) down to
 * `level` (0 = unlimited). Outcome ok with every rendered line, failed with one line for no world or a load
 * failure, invalid with one line for no such node; result lines come all or none, as rendering is pure and comes
 * last. Programming errors propagate and crash with their stack.
 */
export function runTree(root: string, node: string | undefined, level: number): Promise<Report> {
  return orFailed(async () => {
    // Unchecked: any world that loads gets a tree.
    const world = await loadWorld(root);
    let start: number | null = null;
    if (node !== undefined) {
      try {
        start = findNode(world, node, root, "tree");
      } catch (error) {
        // A path naming no node is an invalid argument value: exit 2, as Cli's usage errors.
        return invalidFrom(error);
      }
    }
    return ok(renderTree(world, root, start, level));
  });
}
