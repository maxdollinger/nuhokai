import { CliError, isExpected, oneLine } from "../shared/failure.ts";
import { inspectTarget } from "../shared/inspect.ts";
import { nameInWorld } from "../shared/paths.ts";
import { failure, type Report, result } from "../shared/report.ts";
import { publishWorld } from "./publish.ts";

/**
 * The init command: inspect, publish, report. Creates the world in the project
 * directory `root`, named from the cwd, or says why not, and resolves to the
 * Report Cli prints; programming errors propagate and crash with their stack.
 */
export async function runInit(root: string): Promise<Report> {
  try {
    const state = inspectTarget(root);

    if (state.kind === "world") {
      return { outcome: "ok", lines: [result(`${nameInWorld(root)}/ already exists; nothing to do`)] };
    }
    if (state.kind === "occupied") {
      throw new CliError(`${nameInWorld(root)} exists but is not a directory`);
    }

    return { outcome: "ok", lines: publishWorld(root).map((path) => result(path)) };
  } catch (error) {
    // Expected failures become one failure line; a bug crashes with its stack.
    if (!isExpected(error)) throw error;
    return { outcome: "failed", lines: [failure(oneLine(error))] };
  }
}
