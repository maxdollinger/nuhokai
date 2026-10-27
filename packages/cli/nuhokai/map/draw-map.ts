import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { Inspect } from "../inspect.ts";
import { LoadWorld } from "../load-world.ts";
import { MapFile } from "./map-file.ts";

/** The program inside WorldMap: inspect, load, write, print. */
export const DrawMap = node({
  id: "01a179c9-f7c9-7305-abbf-02a688335a0d",
  purpose: "The program inside WorldMap: order and exit codes only.",
  status: "building",
  source: ["packages/cli/src/map/draw-map.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Draw the world's map",
      input: "project directory",
      output: "exit 0 or 1; stdout: the from-root path; stderr: one 'nuhokai map: ' line per failure",
      errors: ["no world at nuhokai/", "a non-directory at nuhokai/", "the world failed to load", "the write failed"],
    },
  },
  requirements: [
    { id: "R1", text: "Order: inspect, load, write, print; a load failure writes nothing." },
    { id: "R2", text: "absent → error naming init; occupied → error; world → load and write." },
  ],
  testCases: [
    { text: "No world, or a file at nuhokai: one stderr line, exit 1, nothing written.", demonstrates: ["R2"] },
    {
      text: "A throwing node file: one line naming the file, exit 1, previous map kept.",
      demonstrates: ["R1"],
    },
  ],
}).edges({
  uses: () => [Inspect.inspect, LoadWorld.load, MapFile.write, Failure.format, Failure.isExpected],
});
