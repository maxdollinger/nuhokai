import { node } from "@nuhokai/world";
import { Terminal } from "../external.ts";
import { Failure } from "../failure.ts";
import { LoadWorld } from "../load-world.ts";
import { MapFile } from "./map-file.ts";

/** The program inside WorldMap: load, write, print. */
export const DrawMap = node({
  id: "01a179c9-f7c9-7305-abbf-02a688335a0d",
  purpose: "The program inside WorldMap: order and exit codes only.",
  status: "building",
  source: ["src/map/draw-map.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Draw the world's map",
      input: "project directory",
      output: "exit 0 or 1; stdout: map's path (cwd-relative); stderr: one 'nuhokai map: ' line per failure",
      errors: ["no world at nuhokai/", "non-directory at nuhokai/", "world failed to load", "write failed"],
    },
  },
  requirements: [
    { id: "R1", text: "Order: load, write, print; a load failure writes nothing." },
    {
      id: "R2",
      text: "No world is a load failure like any other (LoadWorld R11): one line, exit 1.",
    },
  ],
  testCases: [
    { text: "No world, or a file at nuhokai → one stderr line, exit 1, nothing written.", demonstrates: ["R2"] },
    {
      text: "A node file that does not parse → one line naming the file and line, exit 1, previous map kept.",
      demonstrates: ["R1"],
    },
  ],
}).edges({
  uses: () => [LoadWorld.load, MapFile.write, Failure.format, Failure.isExpected, Terminal.print, Terminal.printError],
});
