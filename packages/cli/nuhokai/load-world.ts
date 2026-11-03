import { node } from "@nuhokai/world";
import { FileSystem } from "./externals/file-system.ts";
import { Tsgo } from "./externals/tsgo.ts";
import { Failure } from "./failure.ts";
import { Inspect } from "./inspect.ts";
import { Path } from "./path/path.ts";

/** The world as plain NodeSpec data. Reads, never runs, judges nothing. */
export const LoadWorld = node({
  id: "01a179c9-f7b6-7074-9245-bb542a950ec4",
  purpose:
    "Read nuhokai/ without running it → the world's id, name and source, NodeSpecs, tbd placeholders, and where each " +
    "node is listed and defined. Shared; checks no rule, writes nothing in the project.",
  status: "building",
  source: ["src/load/**"],
  ports: {
    load: {
      kind: "call",
      purpose: "Load the project directory's world",
      input: "project directory, cwd-relative",
      output:
        "id, name, source: the world's; file: the world file, cwd-relative; nodes: NodeSpec[]; parents: (position in nodes | null)[]; placeholders: { kind, description, name?, users: node ids }[]; listings: { node: node id, parent: node id | null }[]; orphans: { id, name, file }[]; files: { node: node id, file, line? }[]",
      errors: [
        "NoWorldError: no world at nuhokai/, naming init",
        "NoWorldError: non-directory at nuhokai/",
        "no nuhokai/index.ts",
        "a world file does not parse, naming its line",
        "a value is not data the loader can read (a call, an import from a package, …), naming its line",
        "default export not a world",
        "uses or implements returns a non-list",
        "a symlink in nuhokai/ cannot be resolved",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Reads all nuhokai/**/*.ts, symlinks included, except .generated/, *.d.ts, *.test.ts, with the pinned checker in a project of its own: exactly those files, no lib, whatever nuhokai/tsconfig.json says or whether it is there. Runs nothing, so import cycles never matter and nothing is installed.",
    },
    {
      id: "R12",
      text: "A world file is data, and LoadWorld is the one judge of that: every top-level statement is an import, an export or a declaration, and every top-level value and every node's uses and implements are read, reached from the world or not. Readable: literals, objects, arrays, spreads, string + and templates, as const, consts, imports between world files, node, .edges, defineWorld, tbd.call, tbd.event and inherited imported from @nuhokai/world under their own name, and arrow functions that are an expression or one return. A name resolves to its declaration through imports, re-exports and aliases. Anything else is a load error at its line; another call reads 'world files are declarative: they call only …, not <callee>(...)'.",
    },
    {
      id: "R13",
      text: "A dome's ports are copied from the child ports they reference, each with delegate { to: child id, port }; a port of a non-child, or one its node lacks, is a load error at the dome's node() line.",
    },
    {
      id: "R2",
      text: "Node = a node(…).edges(…) call, as its NodeSpec per packages/world/README.md. Name: export name; exported twice → the defining file's (the one holding the call), a re-export or alias never; else first in sorted file order; unexported → id. Errors about a node name its defining file.",
    },
    { id: "R3", text: "Order: depth-first from the world, parent before children, list order; each node once." },
    {
      id: "R4",
      text: "tbd: no edge; one placeholder per tbd call with all its users; ordered by first use. Named by export as R2 names a node; an unexported (inline) tbd has no name.",
    },
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
      text: "files: each reachable node's defining file as R2 picks it, cwd-relative, and the line of its node() call; in nodes order.",
    },
    {
      id: "R10",
      text: "parents: each node's parent as its position in nodes, null at the top level; in nodes order; unambiguous under duplicate ids.",
    },
    {
      id: "R11",
      text: "Inspect.requireWorld first: no world or a non-directory at nuhokai/ → its NoWorldError, nothing read; every other load error is a plain CliError. Callers never inspect for the load's sake.",
    },
    { id: "C1", kind: "constraint", text: "No global rules (ids, orphans, scope, names): check's." },
    {
      id: "C2",
      kind: "constraint",
      text: "Writes nothing in the project and prompts nothing; spawns only the checker, and its project file lives in a temporary directory removed afterwards.",
    },
  ],
  testCases: [
    {
      text: "No nuhokai/, or a file there → one NoWorldError (naming init when absent), nothing read; a missing index.ts → a CliError that is no NoWorldError.",
      demonstrates: ["R11"],
    },
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
      text: "tbd exported from holes.ts and re-exported as alias from a.ts → named hole; an inline tbd → no name.",
      demonstrates: ["R4"],
    },
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
      text: "Syntax error, a uses function with a block of statements (also an orphan's), a call to String, a top-level throw, an unused const holding Date.now(), node imported as n, a name imported from a package or a missing file, non-world default export, uses returning a non-list → one CliError each naming the file, with its line where it points at code. Unexported node → named by id.",
      demonstrates: ["R2", "R5", "R6", "R12"],
    },
    {
      text: "The CLI, a world file using a value from an uncached package → one 'nuhokai map: nuhokai/example.ts:<line>' line naming the package, exit 1; nothing installed. Symlinked node file → named by export.",
      demonstrates: ["R1", "R2", "R5"],
    },
    {
      text: "Dome Cmd with child Leaf (cmd/a-leaf.ts sorts first) using Caller, which uses Cmd.run, and a file that throws at its top → loads, also with index.ts importing Leaf before Cmd.",
      demonstrates: ["R1"],
    },
    {
      text: "ports: { run: Other.run } with Other no child, or { run: Leaf.nope } → one CliError at the dome's node() line.",
      demonstrates: ["R13"],
    },
    {
      text: "Barrel index.ts re-exporting Bad from zbad.ts → named Bad, a Bad.uses returning no list blames nuhokai/zbad.ts; `export { Late as Early }` keeps Late.",
      demonstrates: ["R2", "R5"],
    },
  ],
  decisions: [
    {
      decision: "LoadWorld runs Inspect.requireWorld itself.",
      why: "Every load needs a world, and every caller guarded it the same way; one guard here cannot be forgotten by the next command.",
      rejected: [
        { option: "Each caller inspects before loading", why: "A copy per command (map, check, tree) for one rule." },
      ],
    },
    {
      decision:
        "Top-level shared loader for map, check and tree; outputs the world's id, name and source, NodeSpecs and tbd placeholders.",
      why: "map and check need the same load; node-spec.ts stays the only node shape; NodeSpec has no target-less edge; the world id keys per-world state.",
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
      why: "Every check finding needs a location; the node() call has both.",
    },
    {
      decision: "parents gives each node's parent by position, not by id.",
      why: "Duplicate ids are check's to report, so a parent id cannot rebuild the tree; the walk knows each parent by reference.",
    },
    {
      decision: "Read every node file, not only index.ts's imports.",
      why: "Names come from exports, and orphans are the exported nodes the walk misses.",
    },
    {
      decision:
        "Read, never run: the pinned checker parses the world files and resolves each name to its declaration; the format's calls are read as data.",
      why: "World files are declarative already (TypeCheck R2). Running them made import cycles fail, needed a runtime per process, a virtual module, stack traces for locations and a caveat that map runs the project's code. Reading gives every value its file and line, and runs nothing.",
      rejected: [
        {
          option: "Evaluate the files with Bun, @nuhokai/world as a virtual module",
          why: "Import cycles through a dome failed by file order; locations came from stack frames; the loader was no sandbox.",
        },
        {
          option: "A parser and resolver of our own",
          why: "The checker already ships with the CLI and resolves imports, re-exports and aliases as the editor does.",
        },
      ],
    },
    {
      decision: "The loader opens a project of its own: exactly the world files, no lib.",
      why: "Reading needs the files parsed and their imports resolved, nothing type-checked; it should not depend on nuhokai/tsconfig.json being there or unedited, and no lib keeps it fast.",
      rejected: [
        {
          option: "Open nuhokai/tsconfig.json",
          why: "map and tree would fail without it, and an edited include could hide a world file.",
        },
      ],
    },
    {
      decision: "Defining file = the file holding the node() or tbd call a name resolves to.",
      why: "Module exports cannot tell a definer from a re-exporter; the declaration can, whatever the export's syntax.",
    },
  ],
}).edges({
  uses: () => [Inspect.requireWorld, Path.inWorld, Failure.format, FileSystem.read, FileSystem.write, Tsgo.read],
});
