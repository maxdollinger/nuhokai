import { node } from "@nuhokai/world";
import { Path } from "../../path/path.ts";
import { Diagnostics } from "../diagnostics.ts";

/** The rules on the loaded world alone: R1–R5, R9, R11. */
export const DataRules = node({
  id: "01a188c9-4a04-759d-858c-dfb823667aa4",
  purpose:
    "Judge the world's tree and edges from the loaded data alone: ids, orphans, scope, names, rules tsc leaves to check, built nodes with code.",
  status: "built",
  source: ["src/check/spec-check/data-rules.ts"],
  requirements: [
    { id: "R1", text: "Pure: reads only the loaded world, no filesystem." },
    {
      id: "R2",
      text: "A finding's location is the offending node's entry in LoadWorld's files; one about a listing points at the file of the list it is in.",
    },
    {
      id: "R3",
      text: "A finding about the world itself points at its defineWorld call, line and column, in the file holding it (LoadWorld's definedIn: index.ts, or a world file it re-exports the world from).",
    },
    {
      id: "R4",
      text: "A missing, non-string or blank world name is an error, never a crash. It re-checks what tsc checks of defineWorld's name, so after a type error in the file holding defineWorld it is left out; a name tsc cannot judge (a const typed string) is still reported beside a type error elsewhere.",
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
}).edges({ uses: () => [Diagnostics.locate, Path.childrenOf, Path.isAncestor] });
