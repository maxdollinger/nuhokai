import { node } from "@nuhokai/world";

/** The rules on the loaded world alone: R1–R5, R9, R11. */
export const DataRules = node({
  id: "01a188c9-4a04-759d-858c-dfb823667aa4",
  purpose:
    "Judge the world's tree and edges from the loaded data alone: ids, orphans, scope, names, rules tsc leaves to check, built nodes with code.",
  status: "planned",
  source: [],
  requirements: [
    { id: "R1", text: "Pure: reads only the loaded world, no filesystem." },
    {
      id: "R2",
      text: "A finding's location is the offending node's entry in LoadWorld's files; one about a listing points at the file of the list it is in.",
    },
  ],
  ports: {
    check: {
      kind: "call",
      purpose: "Judge the graph rules",
      input: "the loaded world, as LoadWorld.load answers it",
      output: "findings as Diagnostics.format takes them",
    },
  },
}).edges({});
