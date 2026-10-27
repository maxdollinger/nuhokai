import { node } from "@nuhokai/world";
import { AddNode } from "./add-node.ts";
import { NodeFile } from "./node-file.ts";

/** The new boundary: add one node file to an existing world. */
export const New = node({
  id: "01a17950-b221-711f-90af-db2521515c8d",
  purpose:
    "Add one node file to an existing world: nuhokai/<node-path>.ts with a fresh uuidv7 and TODO: placeholders. Never edits, overwrites, loads or checks. run → AddNode.",
  status: "building",
  source: ["packages/cli/src/new/**"],
  requirements: [
    {
      id: "R1",
      text: "Exactly one new file, nuhokai/<node-path>.ts, plus missing parent directories; no other file changes; it loads as one planned leaf.",
    },
    {
      id: "R2",
      text: "stdout: written path (cwd-relative), then a line naming nuhokai/index.ts. Failure: one stderr line, no stdout.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "One argument, the node path. Cli owns count, --help and --path; New owns the path rule.",
    },
  ],
  testCases: [
    {
      text: "After init, new new/stock-order writes and prints nuhokai/new/stock-order.ts and the index.ts line, exit 0; a second run, existing path or no world → no file, one stderr line.",
      demonstrates: ["R1", "R2"],
    },
  ],
  children: { addNode: AddNode, nodeFile: NodeFile },
  ports: (c) => ({ run: c.addNode.ports.run }),
}).edges({});
