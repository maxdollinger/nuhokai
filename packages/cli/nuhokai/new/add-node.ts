import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { Inspect } from "../inspect.ts";
import { ResolveTarget } from "../resolve-target.ts";
import { WorldPath } from "../world-path.ts";
import { NodeFile } from "./node-file.ts";

/** The program inside New: parse, resolve, inspect, id, create, print. */
export const AddNode = node({
  id: "01a17950-b221-7120-be93-f49dcd85d151",
  purpose:
    "The program inside New: owns the order, the path rule, the id and the exit mapping; no template, layout or filesystem of its own.",
  status: "planned",
  source: ["packages/cli/src/new/add-node.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Add the node file to the world",
      input: "the cwd and the path",
      output:
        "exit 0 written, 1 operational failure, 2 argument error; stdout: the from-root path, then a line naming nuhokai/index.ts; stderr: one line per failure, prefixed 'nuhokai new: '",
      errors: [
        "invalid path",
        "no git and no terminal",
        "the user declined the cwd",
        "no world at nuhokai/",
        "the file already exists",
        "a parent directory cannot be created",
        "the write failed",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Order: parse, resolve, inspect, id, create, print; a bad path fails before any git call, prompt or write.",
    },
    {
      id: "R2",
      text: "Segments match ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ (kebab-case, no extension); the last is not index; the export is its PascalCase; WorldPath merges them as nuhokai/<segments>.ts.",
    },
    { id: "R3", text: "The id is a fresh uuidv7 per run, handed to the node file; no lookup in the world." },
    { id: "R4", text: "absent → one error naming init; occupied → one error; world → write." },
  ],
  testCases: [
    {
      text: "new/StockOrder, new//stock-order, ../escape, /abs and new/index exit 2 with one stderr line and no file written.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "After init, new/stock-order writes and prints the path; two runs get different ids; an existing path or no world writes nothing and prints one error.",
      demonstrates: ["R3", "R4"],
    },
  ],
}).edges({
  uses: () => [ResolveTarget.resolve, Inspect.inspect, WorldPath.file, NodeFile.create, Failure.format],
});
