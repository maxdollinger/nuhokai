import { loadWorld } from "../load/load-world.ts";
import { isExpected, oneLine } from "../shared/failure.ts";
import { failure, type Report, result } from "../shared/report.ts";
import { writeMap } from "./map-file.ts";

/**
 * The map command: load (which inspects first), write, report; the order is the program, so a
 * load failure writes nothing. Draws the world in the project directory `root`,
 * named from the cwd, into nuhokai/.generated/map.html, or says why not, and
 * resolves to the Report Cli prints; programming errors propagate and crash
 * with their stack.
 */
export async function runMap(root: string): Promise<Report> {
  try {
    // Unchecked: any world that loads gets a map, because a broken world is when the map helps most.
    const world = await loadWorld(root);
    return { outcome: "ok", lines: [result(writeMap(root, world))] };
  } catch (error) {
    // Expected failures become one failure line; a bug crashes with its stack.
    if (!isExpected(error)) throw error;
    return { outcome: "failed", lines: [failure(oneLine(error))] };
  }
}
