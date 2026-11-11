/** `nuhokai map`: no argument; runs WorldMap. */
import type { Cmd } from "../cmd.ts";

export const mapCmd: Cmd = {
  description: "Draw the world into nuhokai/.generated/map.html, a self-contained 3D map",
  arguments: [],
  output: "the map's path, one line: nuhokai/.generated/map.html under the project directory",
  options: [],
  async run(root) {
    // The map's assets weigh hundreds of KB; only map loads them.
    const { runMap } = await import("../../map/draw-map.ts");
    return runMap(root);
  },
};
