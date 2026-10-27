import { loadWorld } from "../load/load-world.ts";
import { isExpected, oneLine } from "../shared/failure.ts";
import { requireWorld } from "../shared/inspect.ts";
import { writeMap } from "./map-file.ts";

/** What the run port may observe and answer; the defaults are the real process. */
export interface MapEnvironment {
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

/**
 * The map command: inspect, load, write, print; the order is the program, so a
 * load failure writes nothing. Draws the world in the project directory `root`,
 * named from the cwd, into nuhokai/.generated/map.html, or says why not, and
 * resolves to the process exit code; programming errors propagate and crash
 * with their stack.
 */
export async function runMap(root: string, environment: MapEnvironment = {}): Promise<number> {
  const out = environment.out ?? ((line: string) => console.log(line));
  const err = environment.err ?? ((line: string) => console.error(line));

  try {
    requireWorld(root);
    // Unchecked: any world that loads gets a map, because a broken world is when the map helps most.
    const world = await loadWorld(root);
    out(writeMap(root, world));
    return 0;
  } catch (error) {
    // Expected failures become one stderr line; a bug crashes with its stack.
    if (!isExpected(error)) throw error;
    err(`nuhokai map: ${oneLine(error)}`);
    return 1;
  }
}
