import { loadWorld } from "../load/load-world.ts";
import { CliError, isExpected, oneLine } from "../shared/failure.ts";
import { WORLD_DIR } from "../shared/paths.ts";
import { inspectTarget } from "../target/inspect.ts";
import { type ResolveTargetEnvironment, resolveTarget } from "../target/resolve-target.ts";
import { writeMap } from "./map-file.ts";

/** What the run port may observe and answer; the defaults are the real process. */
export interface MapEnvironment extends ResolveTargetEnvironment {
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

/** The run port's result, before it becomes lines and an exit code. */
export type DrawMapOutcome =
  | { readonly kind: "written"; readonly path: string }
  | { readonly kind: "failed"; readonly message: string };

/** Resolve, inspect, load, write: the order is the program, so a load failure writes nothing. Prints nothing. */
export async function drawMap(cwd: string, environment: MapEnvironment = {}): Promise<DrawMapOutcome> {
  try {
    const root = await resolveTarget(cwd, environment);
    const state = inspectTarget(root);
    if (state.kind === "absent") {
      throw new CliError(`no world at ${WORLD_DIR}/; run \`nuhokai init\` first`);
    }
    if (state.kind === "occupied") {
      throw new CliError(`${WORLD_DIR} exists but is not a directory`);
    }

    // Unchecked: any world that loads gets a map, because a broken world is when the map helps most.
    const world = await loadWorld(root);
    return { kind: "written", path: writeMap(root, world) };
  } catch (error) {
    // Expected failures become one stderr line; a bug crashes with its stack.
    if (!isExpected(error)) throw error;
    return { kind: "failed", message: oneLine(error) };
  }
}

/**
 * The map command: draw the world at the target into nuhokai/.generated/map.html,
 * or say why not. Prints the one line of either outcome here and resolves to the
 * process exit code; programming errors propagate and crash with their stack.
 */
export async function runMap(cwd: string, environment: MapEnvironment = {}): Promise<number> {
  const out = environment.out ?? ((line: string) => console.log(line));
  const err = environment.err ?? ((line: string) => console.error(line));

  const outcome = await drawMap(cwd, environment);
  switch (outcome.kind) {
    case "written":
      out(outcome.path);
      return 0;
    case "failed":
      err(`nuhokai map: ${outcome.message}`);
      return 1;
  }
}
