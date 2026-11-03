import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { LoadWorld } from "../load-world.ts";
import { Path } from "../path/path.ts";
import { TreeLines } from "./tree-lines.ts";

/** The program inside Tree: load, find, render, report. */
export const PrintTree = node({
  id: "01a19cc8-5db7-7499-b1d8-5c6f35694e25",
  purpose: "The program inside Tree: order and outcome only; never prints.",
  status: "built",
  source: ["src/tree/print-tree.ts", "src/tree/print-tree.test.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Return a Report of the world's node hierarchy, one line per node",
      input: "project directory (cwd-relative), hierarchy path or none, level: whole number, 0 = unlimited",
      output:
        "Report: ok with TreeLines' lines as result lines; failed (no world or a load failure) or invalid (no such node) with one failure line",
      errors: [
        "no world at nuhokai/",
        "non-directory at nuhokai/",
        "world failed to load",
        "no node at the path: names the closest match",
        "two siblings share a name on the path",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Order: load, find the start (with the project directory, so a hint runs as printed), render, report; the Report holds every result line or none.",
    },
    {
      id: "R2",
      text: "No world is a load failure like any other (LoadWorld R11): one failure line, failed.",
    },
    {
      id: "R3",
      text: "Path.findNode's error → invalid, an invalid argument value (Cli exits 2), its message as the failure line. No world or a load failure → failed.",
    },
  ],
  testCases: [
    { text: "No world, or a file at nuhokai → one failure line, failed, no result line.", demonstrates: ["R2"] },
    {
      text: "A node file that does not parse → one failure line naming the file, failed; tree Shop/Stok → \"no node 'Shop/Stok'; did you mean `nuhokai tree Shop/Stock`?\", invalid, no result line.",
      demonstrates: ["R1", "R3"],
    },
  ],
}).edges({
  uses: () => [LoadWorld.load, Path.findNode, TreeLines.render, Failure.format, Failure.report],
});
