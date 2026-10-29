import { node } from "@nuhokai/world";

/** The rules on the loaded world alone: R1–R4, R9. */
export const DataRules = node({
  id: "01a188c9-4a04-759d-858c-dfb823667aa4",
  purpose: "Judge the world's graph: ids, orphans, scope, names, built nodes with code.",
  status: "planned",
  source: [],
  ports: {
    check: {
      kind: "call",
      purpose: "Judge the graph rules",
      input: "the loaded world, as LoadWorld.load answers it",
      output: "findings as Diagnostics.format takes them",
    },
  },
}).edges({});
