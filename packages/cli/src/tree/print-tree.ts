import { loadWorld } from "../load/load-world.ts";
import { CliError, isExpected, oneLine } from "../shared/failure.ts";
import { findNode } from "../shared/node-path.ts";
import { renderTree } from "./tree-lines.ts";

/** What the run port may observe and answer; the defaults are the real process. */
export interface TreeEnvironment {
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

/**
 * The tree command: load, find the start, render, print. Prints the node hierarchy of the world in the project
 * directory `root`, named from the cwd, from the node at hierarchy path `node` (else the top level) down to
 * `level` (0 = unlimited). Resolves to 0 printed, 1 no world or a load failure, 2 no such node; stdout gets every
 * line or none. Programming errors propagate and crash with their stack.
 */
export async function runTree(
  root: string,
  node: string | undefined,
  level: number,
  environment: TreeEnvironment = {},
): Promise<number> {
  const out = environment.out ?? ((line: string) => console.log(line));
  const err = environment.err ?? ((line: string) => console.error(line));

  let lines: string[];
  try {
    // Unchecked: any world that loads gets a tree.
    const world = await loadWorld(root);
    let start: number | null = null;
    if (node !== undefined) {
      try {
        start = findNode(world, node);
      } catch (error) {
        // A path naming no node is an invalid argument value: exit 2, as Cli's usage errors.
        if (!(error instanceof CliError)) throw error;
        err(`nuhokai tree: ${oneLine(error)}`);
        return 2;
      }
    }
    lines = renderTree(world, root, start, level);
  } catch (error) {
    // Expected failures become one stderr line; a bug crashes with its stack.
    if (!isExpected(error)) throw error;
    err(`nuhokai tree: ${oneLine(error)}`);
    return 1;
  }
  for (const line of lines) out(line);
  return 0;
}
