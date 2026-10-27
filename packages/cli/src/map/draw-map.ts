import { loadWorld } from "../load/load-world.ts";
import { isExpected, oneLine } from "../shared/failure.ts";
import { requireWorld } from "../target/inspect.ts";
import { writeMap } from "./map-file.ts";

/** What the run port may observe and answer; the defaults are the real process. */
export interface MapEnvironment {
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

/** The run port's result, before it becomes lines and an exit code. */
export type DrawMapOutcome =
  | { readonly kind: "written"; readonly path: string }
  | { readonly kind: "failed"; readonly message: string };

/** Inspect, load, write: the order is the program, so a load failure writes nothing. Prints nothing. */
export async function drawMap(root: string): Promise<DrawMapOutcome> {
  try {
    requireWorld(root);

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
 * The map command: draw the world in the project directory into nuhokai/.generated/map.html,
 * or say why not. Prints the one line of either outcome here and resolves to the
 * process exit code; programming errors propagate and crash with their stack.
 */
export async function runMap(root: string, environment: MapEnvironment = {}): Promise<number> {
  const out = environment.out ?? ((line: string) => console.log(line));
  const err = environment.err ?? ((line: string) => console.error(line));

  const outcome = await drawMap(root);
  switch (outcome.kind) {
    case "written":
      out(outcome.path);
      return 0;
    case "failed":
      err(`nuhokai map: ${outcome.message}`);
      return 1;
  }
}
