import { node } from "@nuhokai/world";
import { AddNode } from "./add-node.ts";
import { NodeFile } from "./node-file.ts";

/** The new boundary: add one node file to an existing world. */
export const New = node({
  id: "01a17950-b221-711f-90af-db2521515c8d",
  purpose:
    "Add one node file to an existing world: nuhokai/<path>.ts with a fresh uuidv7 and TODO: placeholders, then one stdout line naming nuhokai/index.ts. Never edits, overwrites, loads or checks. run delegates to AddNode.",
  status: "planned",
  source: ["packages/cli/src/new/**"],
  requirements: [
    {
      id: "R1",
      text: "Exactly one new file, nuhokai/<path>.ts plus its missing parent directories; no other file changes, and the file loads as one planned leaf.",
    },
    {
      id: "R2",
      text: "stdout: the from-root path, then a line naming nuhokai/index.ts; a failure: one stderr line, no stdout.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "One argument, the path; --help is the only flag. Cli owns the count, New owns the path rule.",
    },
  ],
  testCases: [
    {
      text: "After init, new new/stock-order writes and prints nuhokai/new/stock-order.ts and the index.ts line, exits 0; a second run, an existing path or no world writes no file and prints one stderr line.",
      demonstrates: ["R1", "R2"],
    },
  ],
  children: { addNode: AddNode, nodeFile: NodeFile },
  ports: (c) => ({ run: c.addNode.ports.run }),
}).edges({});
