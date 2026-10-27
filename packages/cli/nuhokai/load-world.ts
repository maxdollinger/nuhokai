import { node } from "@nuhokai/world";
import { Failure } from "./failure.ts";
import { WorldPath } from "./world-path.ts";

/** The world as plain NodeSpec data. Evaluates, judges nothing. */
export const LoadWorld = node({
  id: "01a179c9-f7b6-7074-9245-bb542a950ec4",
  purpose: "Evaluate nuhokai/ → world id, NodeSpecs, tbd placeholders. Shared; checks no rule, writes nothing.",
  status: "building",
  source: ["packages/cli/src/load/**"],
  ports: {
    load: {
      kind: "call",
      purpose: "Load the project directory's world",
      input: "project directory, cwd-relative",
      output: "id: world id; nodes: NodeSpec[]; placeholders: { kind, description, users: node ids }[]",
      errors: [
        "no nuhokai/index.ts",
        "world file failed to evaluate",
        "default export not a world",
        "uses or implements returns a non-list",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Evaluates all nuhokai/**/*.ts, symlinks included, except .generated/, *.d.ts, *.test.ts. @nuhokai/world = the CLI's runtime, via a virtual module; no node_modules. Any other import resolves as Bun resolves it, never installed (bun --no-install); unresolvable → ordinary load error naming the importing file.",
    },
    {
      id: "R2",
      text: "Node = its NodeSpec per packages/world/README.md. Name: export name; exported twice → first in sorted file order; unexported → id.",
    },
    { id: "R3", text: "Order: depth-first from the world, parent before children, record order; each node once." },
    { id: "R4", text: "tbd: no edge; one placeholder per tbd object with all its users; ordered by first use." },
    {
      id: "R5",
      text: "Load error: one CliError naming the cwd-relative file and, if known, line: 'nuhokai/orders.ts:3: <message>', under --path app 'app/nuhokai/orders.ts:3: <message>'.",
    },
    { id: "R6", text: "World id as in defineWorld; a default export without a string id is not a world." },
    { id: "C1", kind: "constraint", text: "No global rules (ids, orphans, scope, names): check's." },
    { id: "C2", kind: "constraint", text: "Writes, spawns, prompts nothing." },
    {
      id: "C3",
      kind: "constraint",
      text: "Once per project directory per process: Bun caches modules by path, so a second load returns the first evaluation.",
    },
  ],
  testCases: [
    {
      text: "After init, no node_modules: loads init's world id, Example (named by export) and its tbd placeholder.",
      demonstrates: ["R1", "R2", "R4", "R6"],
    },
    {
      text: "Child using two ports of one target → one edge, both ports; dome ports keep delegates; node listed twice → once, at first listing.",
      demonstrates: ["R2", "R3"],
    },
    { text: "tbd used by two nodes → one placeholder, both ids, no edges.", demonstrates: ["R4"] },
    {
      text: "Syntax error, throwing file, non-world default export, world without id, uses returning a non-list → one CliError each naming the file, with line for the first two. Unexported node → named by id.",
      demonstrates: ["R2", "R5", "R6"],
    },
    {
      text: "CLI under bun --no-install, world file importing an uncached package → one 'nuhokai map: nuhokai/<file>' line, exit 1; nothing installed. Unresolvable import in a file reached through another → names that file. Symlinked node file → named by export.",
      demonstrates: ["R1", "R2", "R5"],
    },
  ],
  decisions: [
    {
      decision: "Top-level shared loader; outputs world id, NodeSpecs, tbd placeholders.",
      why: "check needs the same load; node-spec.ts stays the only node shape; NodeSpec has no target-less edge; the world id keys per-world state.",
    },
    {
      decision: "Evaluate every node file, not only index.ts's imports.",
      why: "Handles carry no name; names come from exports.",
    },
    {
      decision:
        "No import guard: world files import what Bun resolves; the CLI runs with bun --no-install, so nothing is installed. Not a sandbox.",
      why: "World files are the user's code and may still read, fetch or spawn; only network installs are stopped. 'Plain data' imports are a convention a future check may diagnose.",
      rejected: [
        {
          option: "Scan and reject non-relative or outside-nuhokai/ imports",
          why: "Per-file transpile and path bookkeeping for no safety: an allowed file can still do anything.",
        },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file, Failure.format] });
