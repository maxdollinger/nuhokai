import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { Inspect } from "../inspect.ts";
import { LoadWorld } from "../load-world.ts";
import { ResolveTarget } from "../resolve-target.ts";
import { MapFile } from "./map-file.ts";

/** The program inside WorldMap: resolve, inspect, load, write, print. */
export const DrawMap = node({
  id: "01a179c9-f7c9-7305-abbf-02a688335a0d",
  purpose:
    "The program inside WorldMap: owns the order and the exit mapping; no loading, map bytes, layout or filesystem " +
    "of its own.",
  status: "planned",
  source: ["packages/cli/src/map/draw-map.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Draw the world's map",
      input: "the cwd",
      output:
        "exit 0 written, 1 failure; stdout: the from-root path; stderr: one line per failure, prefixed 'nuhokai map: '",
      errors: [
        "no git and no terminal",
        "the user declined the cwd",
        "no world at nuhokai/",
        "a non-directory at nuhokai/",
        "the world failed to load",
        "the write failed",
      ],
    },
  },
  requirements: [
    { id: "R1", text: "Order: resolve, inspect, load, write, print; a load failure writes nothing." },
    { id: "R2", text: "absent → one error naming init; occupied → one error; world → load and write." },
  ],
  testCases: [
    {
      text: "No world, or a file at nuhokai, gives one stderr line, exit 1, nothing written.",
      demonstrates: ["R2"],
    },
    {
      text: "A node file that throws gives one 'nuhokai map: ' line naming the file, exit 1, and the previous map stays.",
      demonstrates: ["R1"],
    },
  ],
}).edges({
  uses: () => [
    ResolveTarget.resolve,
    Inspect.inspect,
    LoadWorld.load,
    MapFile.write,
    Failure.format,
    Failure.isExpected,
  ],
});
