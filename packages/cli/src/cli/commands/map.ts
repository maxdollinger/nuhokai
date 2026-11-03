/** `nuhokai map`: no argument; runs WorldMap. */
import type { Cmd } from "../cmd.ts";

export const mapCmd: Cmd = {
  description: "Draw the world into nuhokai/.generated/map.html, a self-contained 3D map",
  positionals: [],
  options: [],
  async run(root) {
    // The map's assets weigh hundreds of KB; only map loads them.
    const { runMap } = await import("../../map/index.ts");
    return runMap(root);
  },
};
