/** `nuhokai map`: no argument; runs WorldMap. */
import { cmd, noArguments } from "../cmd.ts";

export const mapCmd = cmd<undefined>({
  description: "Draw the world into nuhokai/.generated/map.html, a self-contained 3D map",
  synopsis: "nuhokai map",
  options: [],
  parse: noArguments,
  async exec(root) {
    // The map's assets weigh hundreds of KB; only map loads them.
    const { runMap } = await import("../../map/index.ts");
    return runMap(root);
  },
});
