import { node } from "@nuhokai/world";
import { Failure } from "./failure.ts";
import { WorldPath } from "./world-path.ts";

/** The world as plain NodeSpec data. Evaluates, judges nothing. */
export const LoadWorld = node({
  id: "01a179c9-f7b6-7074-9245-bb542a950ec4",
  purpose: "Evaluate nuhokai/ → world id, NodeSpecs, tbd placeholders. Shared; checks no rule, writes nothing.",
  status: "building",
  source: ["src/load/**"],
  ports: {
    load: {
      kind: "call",
      purpose: "Load the project directory's world",
      input: "project directory, cwd-relative",
      output:
        "id, name, source: the world's; file: the world file, cwd-relative; nodes: NodeSpec[]; parents: (position in nodes | null)[]; placeholders: { kind, description, users: node ids }[]; listings: { node: node id, parent: node id | null }[]; orphans: { id, name, file }[]; files: { node: node id, file, line? }[]",
      errors: [
        "no nuhokai/index.ts",
        "world file failed to evaluate",
        "default export not a world",
        "uses or implements returns a non-list",
        "a symlink in nuhokai/ cannot be resolved",
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
      text: "Node = its NodeSpec per packages/world/README.md. Name: export name; exported twice → the defining file's (whose node() made it), a re-export or alias never; else first in sorted file order; unexported → id. Errors about a node name its defining file.",
    },
    { id: "R3", text: "Order: depth-first from the world, parent before children, record order; each node once." },
    { id: "R4", text: "tbd: no edge; one placeholder per tbd object with all its users; ordered by first use." },
    {
      id: "R5",
      text: "Load error: one CliError naming the cwd-relative file and, if known, line: 'nuhokai/orders.ts:3: <message>', under --path app 'app/nuhokai/orders.ts:3: <message>'.",
    },
    {
      id: "R6",
      text: "World id, name and source as in defineWorld, plus the world file's cwd-relative name; a default export without a string id is not a world.",
    },
    {
      id: "R7",
      text: "listings: every place a node is listed, in walk order, a repeat included; parent null = the world's children.",
    },
    {
      id: "R8",
      text: "orphans: every exported node the walk never reaches, in sorted file order, each once; name and file as R2.",
    },
    {
      id: "R9",
      text: "files: each reachable node's defining file as R2 picks it, cwd-relative, and the line of its node() call when known; in nodes order.",
    },
    {
      id: "R10",
      text: "parents: each node's parent as its position in nodes, null at the top level; in nodes order; unambiguous under duplicate ids.",
    },
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
      text: "Child using two ports of one target → one edge, both ports; dome ports keep delegates; node listed twice → once, at first listing, and two listings.",
      demonstrates: ["R2", "R3", "R7"],
    },
    { text: "tbd used by two nodes → one placeholder, both ids, no edges.", demonstrates: ["R4"] },
    {
      text: "Exported node listed nowhere → one orphan with its name and file, not in nodes; exported twice → one orphan.",
      demonstrates: ["R8"],
    },
    {
      text: "Barrel index.ts re-exporting Orders from orders.ts, node() on line 3 → files names nuhokai/orders.ts, line 3.",
      demonstrates: ["R9"],
    },
    {
      text: "Dome P (id x) with children C1 (id x) and C2 → parents [null, 0, 0]: C2's parent is P, not C1.",
      demonstrates: ["R10"],
    },
    {
      text: "Syntax error, throwing file, non-world default export, world without id, uses returning a non-list → one CliError each naming the file, with line for the first two. Unexported node → named by id.",
      demonstrates: ["R2", "R5", "R6"],
    },
    {
      text: "CLI under bun --no-install, world file importing an uncached package → one 'nuhokai map: nuhokai/<file>' line, exit 1; nothing installed. Unresolvable import in a file reached through another → names that file. Symlinked node file → named by export.",
      demonstrates: ["R1", "R2", "R5"],
    },
    {
      text: "Barrel index.ts re-exporting Bad from zbad.ts → named Bad, a throwing Bad.uses blames nuhokai/zbad.ts; `export { Late as Early }` keeps Late.",
      demonstrates: ["R2", "R5"],
    },
  ],
  decisions: [
    {
      decision: "Top-level shared loader; outputs world id, NodeSpecs, tbd placeholders.",
      why: "check needs the same load; node-spec.ts stays the only node shape; NodeSpec has no target-less edge; the world id keys per-world state.",
    },
    {
      decision: "listings keeps every listing, also the repeats R3 drops from nodes.",
      why: "A node listed twice is check's violation and must name both places; the walk already sees them.",
      rejected: [{ option: "check walks the handles itself", why: "A second loader; check shares this load." }],
    },
    {
      decision: "orphans lists exported nodes the walk misses.",
      why: "Orphans are check's violation; only the loader sees every export.",
    },
    {
      decision: "files gives each node's defining file and node() line.",
      why: "Every check finding needs a location; the node() call's stack frame already has both.",
    },
    {
      decision: "parents gives each node's parent by position, not by id.",
      why: "Duplicate ids are check's to report, so a parent id cannot rebuild the tree; the walk knows each parent by reference.",
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
    {
      decision:
        "Defining file = the first world file on the stack of the node() call; the CLI's runtime records it per handle.",
      why: "Module exports cannot tell a definer from a re-exporter; the call site can, whatever the declaration's syntax.",
      rejected: [
        {
          option: "Scan each file's source for a local declaration of the export's name",
          why: "Syntax-bound: misses destructured or computed declarations, matches comments and strings.",
        },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file, Failure.format] });
