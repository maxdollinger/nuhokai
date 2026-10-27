import { node } from "@nuhokai/world";
import { Failure } from "./failure.ts";
import { WorldPath } from "./world-path.ts";

/** The world as plain NodeSpec data. Evaluates, judges nothing. */
export const LoadWorld = node({
  id: "01a179c9-f7b6-7074-9245-bb542a950ec4",
  purpose:
    "Evaluate nuhokai/ and answer the world as NodeSpecs plus its tbd placeholders. Shared; checks no rule, writes nothing.",
  status: "building",
  source: ["packages/cli/src/load/**"],
  ports: {
    load: {
      kind: "call",
      purpose: "Load the world in the project directory",
      input: "the project directory named from the cwd",
      output: "nodes: NodeSpec[]; placeholders: { kind, description, users: node ids }[]",
      errors: [
        "no nuhokai/index.ts",
        "a world file failed to evaluate",
        "a world file imports a package",
        "a world file imports outside nuhokai/",
        "default export is not a world",
        "uses or implements does not return a list",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Evaluates every nuhokai/**/*.ts, symlinks included, except .generated/, *.d.ts, *.test.ts; @nuhokai/world is the CLI's runtime, over nuhokai/tsconfig.json paths; no node_modules. Any other non-relative import in a world file, node: and bun: included, and any import outside nuhokai/ and its listed files is a load error: nothing installed or run.",
    },
    {
      id: "R2",
      text: "Node = the NodeSpec packages/world/README.md maps it to. Name: export name; first in sorted file order if exported twice; id if not exported.",
    },
    { id: "R3", text: "Order: depth-first from the world, parent before children, record order; each node once." },
    { id: "R4", text: "tbd: no edge; one placeholder per tbd object with all its users; ordered by first use." },
    {
      id: "R5",
      text: "Load errors: one CliError naming the file, and the line when known, named from the cwd, e.g. 'nuhokai/orders.ts:3: <message>' or under --path app 'app/nuhokai/orders.ts:3: <message>'.",
    },
    { id: "C1", kind: "constraint", text: "No global rules (ids, orphans, scope, names): check's." },
    { id: "C2", kind: "constraint", text: "Loader writes, spawns and prompts nothing." },
    {
      id: "C3",
      kind: "constraint",
      text: "Once per project directory per process: Bun caches modules by path, so a second load answers the first evaluation.",
    },
  ],
  testCases: [
    {
      text: "After init, no node_modules: loads Example, named by its export, plus its tbd placeholder.",
      demonstrates: ["R1", "R2", "R4"],
    },
    {
      text: "Child using two ports of one target: one edge, both ports; dome ports keep delegates; a node listed twice appears once, first listing.",
      demonstrates: ["R2", "R3"],
    },
    { text: "A tbd used by two nodes: one placeholder, both ids, no edges.", demonstrates: ["R4"] },
    {
      text: "Syntax error, throwing file, non-world default export, uses returning a non-list: one CliError each, naming the file, with the line for the first two. Unexported node: named by id.",
      demonstrates: ["R2", "R5"],
    },
    {
      text: "A bare package or node: import, also in a symlinked file, and a ../ or absolute import of a file outside nuhokai/: one CliError naming the importing file; nothing installed or run. A symlinked node file is named by its export.",
      demonstrates: ["R1", "R2", "R5"],
    },
  ],
  decisions: [
    {
      decision: "Top-level shared loader; output NodeSpec plus tbd placeholders.",
      why: "check needs the same load; node-spec.ts stays the only node shape; NodeSpec has no edge without a target.",
    },
    {
      decision: "Evaluate every node file, not just index.ts's imports.",
      why: "Handles carry no name; names come from exports.",
    },
  ],
}).edges({ uses: () => [WorldPath.file, Failure.format] });
