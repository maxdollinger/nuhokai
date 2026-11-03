import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { LoadWorld } from "../load-world.ts";
import { MapFile } from "./map-file.ts";

/** The program inside WorldMap: load, write, report. */
export const DrawMap = node({
  id: "01a179c9-f7c9-7305-abbf-02a688335a0d",
  purpose: "The program inside WorldMap: order and outcome only; never prints.",
  status: "building",
  source: ["src/map/draw-map.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Draw the world's map",
      input: "project directory",
      output: "Report: ok with map's path (cwd-relative) as its result line; failed with one failure line",
      errors: ["no world at nuhokai/", "non-directory at nuhokai/", "world failed to load", "write failed"],
    },
  },
  requirements: [
    { id: "R1", text: "Order: load, write, report; a load failure writes nothing." },
    {
      id: "R2",
      text: "No world is a load failure like any other (LoadWorld R11): one failure line, failed.",
    },
  ],
  testCases: [
    { text: "No world, or a file at nuhokai → one failure line, failed, nothing written.", demonstrates: ["R2"] },
    {
      text: "A node file that does not parse → one failure line naming the file and line, failed, previous map kept.",
      demonstrates: ["R1"],
    },
  ],
}).edges({
  uses: () => [LoadWorld.load, MapFile.write, Failure.format, Failure.isExpected],
});
