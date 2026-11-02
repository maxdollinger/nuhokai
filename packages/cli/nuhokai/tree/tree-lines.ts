import { node } from "@nuhokai/world";
import { Path } from "../path/path.ts";

/** The tree's text: which nodes, and one line each. Pure. */
export const TreeLines = node({
  id: "01a19cc8-5dbe-71db-9018-c63790688e29",
  purpose:
    "Own the tree's text: pick the nodes below a start down to a level and write one line per node, " +
    "path | source | purpose. Pure: never loads, finds a typed path or prints.",
  status: "planned",
  source: [],
  ports: {
    render: {
      kind: "call",
      purpose: "Write the tree's lines",
      input:
        "the loaded world, project directory (cwd-relative), start: a node's position or none (the top level), level: whole number, 0 = unlimited",
      output: "lines, one per node, in walk order",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Line = path | source | purpose, joined by ' | '. path is the node's hierarchy path (Path.nodePaths); nothing else on the line: no header, world line, indentation, padding or colour.",
    },
    {
      id: "R2",
      text: "source: the node's entries in authored order, joined by ', ', each named cwd-relative by Path.project (packages/cli/src/bin.ts under --path packages/cli); a node without source prints (none).",
    },
    {
      id: "R3",
      text: "purpose: the whole purpose, each whitespace run (newlines included) collapsed to one space, trimmed; one node is always one line.",
    },
    {
      id: "R4",
      text: "No start: the top-level nodes and their descendants down to level, a top-level node counting as 1. A start: the start itself first, then its descendants down to level below it. level 0: every descendant. Walk order, parent before children (LoadWorld R3).",
    },
    {
      id: "R5",
      text: "A printed dome whose children are not printed is collapsed: its path followed by '/ (<n>)', n its direct children, e.g. 'Check/ (5) | src/check/** | Ensure the specs follow the rules.'. A start that is a leaf prints one line.",
    },
    { id: "R6", text: "Same world, directory, start and level → the same lines." },
    { id: "C1", kind: "constraint", text: "No filesystem access, load or printing." },
  ],
  testCases: [
    {
      text: "Example world, no start, level 1 → Postgres, AuditLog, Shop/ (2), each with its source and purpose; level 0 → also Shop/Orders and Shop/Stock, Shop not collapsed.",
      demonstrates: ["R1", "R4", "R5"],
    },
    {
      text: "Example world, start Shop, level 1 → Shop, Shop/Orders, Shop/Stock; start Shop/Orders → one line.",
      demonstrates: ["R4", "R5"],
    },
    {
      text: "Directory packages/app, a node with source [src/a.ts, src/b/**] → packages/app/src/a.ts, packages/app/src/b/**; the cwd → src/a.ts, src/b/**; source [] → (none).",
      demonstrates: ["R2"],
    },
    {
      text: "A purpose with a newline and double spaces → one line, single spaces; rendering twice → identical lines.",
      demonstrates: ["R3", "R6"],
    },
  ],
  decisions: [
    {
      decision:
        "No escaping: the path never holds ' | ', and the purpose comes last, so a bar inside it stays the purpose's.",
      why: "Lines stay readable as written; splitting on the first two ' | ' recovers the fields. A glob with a comma ({a,b}) reads ambiguous in the source field; rare, and the line is still right.",
      rejected: [
        { option: "JSON or TSV output", why: "Harder to read and grep for people; agents read the plain line fine." },
      ],
    },
  ],
}).edges({ uses: () => [Path.nodePaths, Path.project] });
