import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { Inspect } from "../inspect.ts";
import { WorldPath } from "../world-path.ts";
import { NodeFile } from "./node-file.ts";

/** The program inside New: parse, inspect, id, create, print. */
export const AddNode = node({
  id: "01a17950-b221-7120-be93-f49dcd85d151",
  purpose:
    "The program inside New: owns order, path rule, id and exit mapping; no template, layout or filesystem of its own.",
  status: "building",
  source: ["packages/cli/src/new/add-node.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Add the node file to the world",
      input: "project directory, node path",
      output:
        "exit 0 written, 1 operational failure, 2 argument error; stdout: written path (cwd-relative), then a line naming nuhokai/index.ts; stderr: one 'nuhokai new: ' line per failure",
      errors: [
        "invalid node path",
        "no world at nuhokai/",
        "file already exists",
        "parent directory cannot be created",
        "write failed",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Order: parse, inspect, id, create, print; a bad path fails before anything is read or written.",
    },
    {
      id: "R2",
      text: "Segments match ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ (kebab-case, no extension); the last is not index; export = its PascalCase; WorldPath names it nuhokai/<segments>.ts.",
    },
    { id: "R3", text: "Fresh uuidv7 per run, handed to the node file; no lookup in the world." },
    { id: "R4", text: "absent → one error naming init; occupied → one error; world → write." },
  ],
  testCases: [
    {
      text: "new/StockOrder, new//stock-order, ../escape, /abs, new/index → exit 2, one stderr line, no file written.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "After init, new/stock-order writes and prints the path; two runs → different ids; existing path or no world → nothing written, one error.",
      demonstrates: ["R3", "R4"],
    },
  ],
}).edges({
  uses: () => [Inspect.requireWorld, WorldPath.file, NodeFile.create, Failure.format, Failure.isExpected],
});
