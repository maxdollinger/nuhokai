import { CliError } from "../shared/failure.ts";
import { inspectTarget } from "../shared/inspect.ts";
import { nameInWorld } from "../shared/paths.ts";
import { ok, orFailed, type Report } from "../shared/report.ts";
import { publishWorld } from "./publish.ts";

/**
 * The init command: inspect, publish, report. Creates the world in the project
 * directory `root`, named from the cwd, or says why not, and resolves to the
 * Report Cli prints; programming errors propagate and crash with their stack.
 */
export function runInit(root: string): Promise<Report> {
  return orFailed(async () => {
    const state = inspectTarget(root);
    if (state.kind === "world") return ok([`${nameInWorld(root)}/ already exists; nothing to do`]);
    if (state.kind === "occupied") throw new CliError(`${nameInWorld(root)} exists but is not a directory`);
    return ok(publishWorld(root));
  });
}
