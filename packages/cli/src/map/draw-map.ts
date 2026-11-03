import { loadWorld } from "../load/load-world.ts";
import { ok, orFailed, type Report } from "../shared/report.ts";
import { writeMap } from "./map-file.ts";

/**
 * The map command: load (which inspects first), write, report; the order is the program, so a
 * load failure writes nothing. Draws the world in the project directory `root`,
 * named from the cwd, into nuhokai/.generated/map.html, or says why not, and
 * resolves to the Report Cli prints; programming errors propagate and crash
 * with their stack.
 */
export function runMap(root: string): Promise<Report> {
  // Unchecked: any world that loads gets a map, because a broken world is when the map helps most.
  return orFailed(async () => ok([writeMap(root, await loadWorld(root))]));
}
