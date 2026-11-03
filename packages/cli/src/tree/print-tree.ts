import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { CliError, oneLine } from "../shared/failure.ts";
import { findNode } from "../shared/node-path.ts";
import { failedFrom, failureLine, ok, type Report } from "../shared/report.ts";
import { renderTree } from "./tree-lines.ts";

/**
 * The tree command: load, find the start, render, report. Answers the node hierarchy of the world in the project
 * directory `root`, named from the cwd, from the node at hierarchy path `node` (else the top level) down to
 * `level` (0 = unlimited). Outcome ok with every rendered line, failed with one line for no world or a load
 * failure, invalid with one line for no such node; result lines come all or none, as rendering is pure and comes
 * last. Programming errors propagate and crash with their stack.
 */
export async function runTree(root: string, node: string | undefined, level: number): Promise<Report> {
  let world: LoadedWorld;
  try {
    // Unchecked: any world that loads gets a tree.
    world = await loadWorld(root);
  } catch (error) {
    // Expected failures become one failure line; a bug crashes with its stack.
    return failedFrom(error);
  }
  let start: number | null = null;
  if (node !== undefined) {
    try {
      start = findNode(world, node, root);
    } catch (error) {
      // A path naming no node is an invalid argument value: exit 2, as Cli's usage errors.
      if (!(error instanceof CliError)) throw error;
      return { outcome: "invalid", lines: [failureLine(oneLine(error))] };
    }
  }
  return ok(renderTree(world, root, start, level));
}
