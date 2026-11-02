import { node } from "@nuhokai/world";
import { Terminal } from "../externals/terminal.ts";
import { Failure } from "../failure.ts";
import { LoadWorld } from "../load-world.ts";
import { Path } from "../path/path.ts";
import { TreeLines } from "./tree-lines.ts";

/** The program inside Tree: load, find, render, print. */
export const PrintTree = node({
  id: "01a19cc8-5db7-7499-b1d8-5c6f35694e25",
  purpose: "The program inside Tree: order and exit codes only.",
  status: "built",
  source: ["src/tree/print-tree.ts", "src/tree/print-tree.test.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Print the world's node hierarchy",
      input: "project directory (cwd-relative), hierarchy path or none, level: whole number, 0 = unlimited",
      output:
        "exit 0 printed, 1 failure, 2 no such node; stdout: TreeLines' lines; stderr: one 'nuhokai tree: ' line per failure",
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
      text: "Order: load, find the start (with the project directory, so a hint runs as printed), render, print; stdout gets every line or none.",
    },
    {
      id: "R2",
      text: "No world is a load failure like any other (LoadWorld R11): one line, exit 1.",
    },
    {
      id: "R3",
      text: "Path.findNode's error → exit 2, an invalid argument value (Cli's decision), its message after 'nuhokai tree: '. No world or a load failure → exit 1.",
    },
  ],
  testCases: [
    { text: "No world, or a file at nuhokai → one stderr line, exit 1, no stdout.", demonstrates: ["R2"] },
    {
      text: "A node file that does not parse → one line naming the file, exit 1; tree Shop/Stok → \"nuhokai tree: no node 'Shop/Stok'; did you mean 'Shop/Stock'?\", exit 2, no stdout.",
      demonstrates: ["R1", "R3"],
    },
  ],
}).edges({
  uses: () => [
    LoadWorld.load,
    Path.findNode,
    TreeLines.render,
    Failure.format,
    Failure.isExpected,
    Terminal.stdout,
    Terminal.stderr,
  ],
});
