import { CliError, isExpected, oneLine } from "../shared/failure.ts";
import { inspectTarget } from "../shared/inspect.ts";
import { inWorld } from "../shared/paths.ts";
import { publishWorld } from "./publish.ts";

/** What the run port may observe and answer; the defaults are the real process. */
export interface InitEnvironment {
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

/**
 * The init command: inspect, publish, print. Creates the world in the project
 * directory `root`, named from the cwd, or says why not, and resolves to the
 * process exit code; programming errors propagate and crash with their stack.
 */
export async function runInit(root: string, environment: InitEnvironment = {}): Promise<number> {
  const out = environment.out ?? ((line: string) => console.log(line));
  const err = environment.err ?? ((line: string) => console.error(line));

  try {
    const state = inspectTarget(root);

    if (state.kind === "world") {
      out(`${inWorld(root)}/ already exists; nothing to do`);
      return 0;
    }
    if (state.kind === "occupied") {
      throw new CliError(`${inWorld(root)} exists but is not a directory`);
    }

    for (const path of publishWorld(root)) out(path);
    return 0;
  } catch (error) {
    // Expected failures become one stderr line; a bug crashes with its stack.
    if (!isExpected(error)) throw error;
    err(`nuhokai init: ${oneLine(error)}`);
    return 1;
  }
}
