import { node } from "@nuhokai/world";
import { CheckerClient } from "./checker-client.ts";
import { FileSystem } from "./external.ts";
import { Failure } from "./failure.ts";
import { Inspect } from "./inspect.ts";
import { Path } from "./path/path.ts";

/** The world as plain NodeSpec data. Reads, never runs, judges nothing. */
export const LoadWorld = node({
  id: "01a179c9-f7b6-7074-9245-bb542a950ec4",
  purpose:
    "Read nuhokai/ without running it into plain data: the world, each node as its NodeSpec placed in the hierarchy " +
    "and its edges, tbd placeholders, and where everything is written. Checks no rule; writes nothing in the project.",
  status: "building",
  source: ["src/load/**"],
  ports: {
    load: {
      kind: "call",
      purpose: "Load the project directory's world",
      input: "project directory, cwd-relative",
      output:
        "id, name, source: the world's; file: the world file, cwd-relative; definedIn: the file holding the defineWorld call (file, or one it re-exports the world from), with line? of that call, and sourcePlaces? of the world's source; nodes: { index, spec: NodeSpec, parent: position | null, children: positions, uses: (position | null)[], contracts: (position | null)[], path, file, line?, source?: { at?, entries }, places?: { purpose?, ports, requirements, testCases, decisions, uses } }[]; top: positions; placeholders: { kind, description, name?, users: node ids }[]; listings: { node: node id, parent: node id | null, file, line? }[]; orphans: { id, name, file, line? }[]; every place a line, never a column",
      errors: [
        "NoWorldError: no world at nuhokai/, naming init",
        "NoWorldError: non-directory at nuhokai/",
        "no nuhokai/index.ts",
        "a world file does not parse, naming its line",
        "a value is not data the loader can read (a call, an import from a package, …), naming its line",
        "default export not a world",
        "uses or implements returns a non-list",
        "a symlink in nuhokai/ cannot be resolved",
        "a symlink in nuhokai/ leads outside the project directory",
        "a value refers to itself while being read",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Reads all nuhokai/**/*.ts, symlinks included, except .generated/, *.d.ts, *.test.ts, with the pinned checker in a project of its own: exactly those files, no lib, whatever nuhokai/tsconfig.json says or whether it is there. Runs nothing, so import cycles never matter and nothing is installed; a value that refers to itself is a load error at its line, never a hang. A symlink is followed only while it stays inside the project directory or the world folder; one leading out is a load error naming it.",
    },
    {
      id: "R2",
      text: "Node = a node(…).edges(…) call, as its NodeSpec per packages/world/README.md; each call is exactly one node, as a function of the world's own is never called: a uses arrow two nodes share holds one tbd placeholder. Name: export name; exported twice → the defining file's (the one holding the call), a re-export or alias never; else first in sorted file order; unexported → id. Errors about a node name its defining file.",
    },
    { id: "R3", text: "Order: depth-first from the world, parent before children, list order; each node once." },
    {
      id: "R4",
      text: "tbd: no edge; one placeholder per tbd call with all its users; ordered by first use. Named by export as R2 names a node; an unexported (inline) tbd has no name. A description that is no string is empty.",
    },
    {
      id: "R5",
      text: "Load error: one LoadError (a CliError) carrying the cwd-relative file, the line and column when known and the rule, its message 'nuhokai/orders.ts:3: <rule>', under --path app 'app/nuhokai/orders.ts:3: <rule>': no column, as every finding line; the column only tells check its very position (CheckWorld R6). An error about the world's id or children is at that property in the file defineWorld is written in. An error about a node is at its node() line, one about a children item at that item, or at the `...spread` that brought it in from another file. The rule names code it cannot read in words and quotes it ('not an if statement: `if (n) {}`'), never by the parser's kind name, and says what a value is where a node belongs ('item 2 is a draft: node(...) without .edges(...)') or where data belongs, by its path ('A.requirements[0].text holds a tbd placeholder where data belongs; …'). A rule says what to write instead where the reader cannot tell (a syntax error stays the parser's own message): an undeclared name 'is declared nowhere; declare it in a world file, or import it from one', a children that is no list 'is not a list of nodes: children: [A, B]'.",
    },
    {
      id: "R6",
      text: "World id, name and source as in defineWorld, plus the world file's cwd-relative name; a default export without a string id is not a world.",
    },
    {
      id: "R7",
      text: "listings: every place a node is listed, in walk order, a repeat included; parent null = the world's children; with the file the list is written in and the line of the item there (or the ...spread that brought it in), when there.",
    },
    {
      id: "R8",
      text: "orphans: every exported node the walk never reaches, in sorted file order, each once; name and file as R2, with its node() call's line.",
    },
    {
      id: "R9",
      text: "Each node's file: its defining file as R2 picks it, cwd-relative, and the line of its node() call when that file holds it; and where its source property and each entry were written, when in that file, so check points at the entry.",
    },
    {
      id: "R10",
      text: "Each node's parent and children as positions in nodes, the top level as top, unambiguous under duplicate ids; its path named once by Path.nameNodes from those parents.",
    },
    {
      id: "R11",
      text: "Inspect.requireWorld first: no world or a non-directory at nuhokai/ → its NoWorldError, nothing read; every other load error is a LoadError, or a plain CliError when the checker itself fails. Callers never inspect for the load's sake.",
    },
    {
      id: "R12",
      text: "A world file is data, and LoadWorld is the one judge of that: every top-level statement is an import, an export or a declaration, and every top-level value and every node's uses and implements, and every dome's ports, are read, reached from the world or not. Readable: literals, objects, arrays, spreads, string + and templates, as const, consts, imports between world files, node, .edges, defineWorld, tbd.call, tbd.event and inherited imported from @nuhokai/world under their own name, and functions without parameters that are an expression or one return, read as an edge's list where they were written and never called; a function with parameters, used or not, is a load error at its first parameter, as it can only be a factory. A name resolves to its declaration through imports, re-exports and aliases; one from a package is a load error at its import, where the fix is. Anything else is a load error at its line; another call, a call to a function of the world's own included, reads 'world files are declarative: they call only …, not <callee>(...); write what it would make out as data', so a world is never run: no factory, no recursion.",
    },
    {
      id: "R13",
      text: "A dome's ports are copied from the child ports they reference, each with delegate { to: child id, port }; a port of a non-child, or one its node lacks, is a load error at the dome's node() line.",
    },
    {
      id: "R14",
      text: "Each node's uses targets and implements contracts as positions in nodes, in its edges' order (uses edges first, so uses[i] is edges[i]'s target), read by reference as R10 reads parents, so a duplicate id never points elsewhere; a target the walk never reaches (an orphan) is null.",
    },
    {
      id: "R15",
      text: "Where each spec item was written, when the node's file holds its node() call: the line of its purpose, of each port, requirement, test case and decision, and of each uses edge's first item; a spread-in item at its `...spread`. Review cites them.",
    },
    { id: "C1", kind: "constraint", text: "No global rules (ids, orphans, scope, names): check's." },
    {
      id: "C2",
      kind: "constraint",
      text: "Writes nothing in the project and prompts nothing; spawns only the checker, and its project file lives only in the checker's memory: nothing is written anywhere, so nothing is left behind, not even on an interrupt.",
    },
  ],
  testCases: [
    {
      text: "Orders uses Stock.reserve and implements Store; Stock is listed, Store an orphan → Orders' uses [Stock's position], contracts [null]; a second node with Stock's id leaves the target Stock's own position.",
      demonstrates: ["R14"],
    },
    {
      text: "A node with purpose on line 4, requirements R1 on 9 and R2 on 10, a spread-in test case → places give 4, 9, 10 and the spread's line.",
      demonstrates: ["R15"],
    },
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
      text: "Barrel index.ts re-exporting Orders from orders.ts, node() on line 3 → Orders' file is nuhokai/orders.ts, line 3.",
      demonstrates: ["R9"],
    },
    {
      text: "Dome P (id x) with children C1 (id x) and C2, then T → parents null, 0, 0, null; P's children [1, 2]; top [0, 3]; C2 is P/C2, not under C1.",
      demonstrates: ["R10"],
    },
    {
      text: "Syntax error, a uses function with a block of statements (also an orphan's), a call to String, a top-level throw, an unused const holding Date.now(), node imported as n, a name imported from a package or a missing file, non-world default export, uses returning a non-list, a conditional expression, a draft in the world's children → one CliError each naming the file, with its line where it points at code, and the code it cannot read in words and quoted. Unexported node → named by id.",
      demonstrates: ["R2", "R5", "R6", "R12"],
    },
    {
      text: "The CLI, a world file using a value from an uncached package → one 'nuhokai map: nuhokai/example.ts:<line>: …' line naming the package, exit 1; nothing installed. Symlinked node file → named by export.",
      demonstrates: ["R1", "R2", "R5"],
    },
    {
      text: "Dome Cmd with child Leaf (cmd/a-leaf.ts sorts first) using Caller, which uses Cmd.run, and a file that throws at its top → loads, also with index.ts importing Leaf before Cmd.",
      demonstrates: ["R1"],
    },
    {
      text: "ports: { run: Other.run } with Other no child, or { run: Leaf.nope } → one CliError at the dome's node() line, also when no one lists the dome.",
      demonstrates: ["R13"],
    },
    {
      text: "Barrel index.ts re-exporting Bad from zbad.ts → named Bad, a Bad.uses returning no list blames nuhokai/zbad.ts at Bad's node() line; `export { Late as Early }` keeps Late.",
      demonstrates: ["R2", "R5"],
    },
  ],
  decisions: [
    {
      decision:
        "A function of the world's own is only ever read, as an edge's arrow without parameters; calling one is a load error.",
      why: "Reading a call means substituting arguments into a body: a small interpreter, with scopes, identity per call (one node or two?) and recursion that never ends. The format needs arrows only so edges can refer to nodes not yet declared; a node() call then is exactly one node.",
      rejected: [
        {
          option: "Read calls to world functions (factories, helpers)",
          why: "Every rule about them (a node per application, a shared arrow's placeholder once, a depth guard) patched the interpreter, and each fix broke another case.",
        },
      ],
    },
    {
      decision: "LoadWorld runs Inspect.requireWorld itself.",
      why: "Every load needs a world, and every caller guarded it the same way; one guard here cannot be forgotten by the next command.",
      rejected: [
        { option: "Each caller inspects before loading", why: "A copy per command (map, check, tree) for one rule." },
      ],
    },
    {
      decision:
        "Top-level shared loader for map, check, tree and review; outputs the world's id, name and source, NodeSpecs and tbd placeholders.",
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
      decision: "Each loaded node carries its NodeSpec, parent, children, path, defining file and node() line.",
      why: "Every check finding needs a location and a path, and tree, check and the rules all walk the hierarchy; side-by-side arrays made each of them stitch it back together.",
      rejected: [
        {
          option: "nodes: NodeSpec[] beside parents and files arrays aligned by position",
          why: "Every consumer re-zipped them and re-derived children and paths; the map takes the NodeSpecs alone.",
        },
      ],
    },
    {
      decision: "The loaded world records lines, never columns; only a LoadError keeps its column.",
      why: "Every place the world names is printed as file:line (Diagnostics), so a column there is data no reader uses. A LoadError's column stays: CheckWorld R6 tells a load error and tsc's finding at the very same token apart by it.",
      rejected: [
        {
          option: "Keep line and column everywhere",
          why: "Fields every consumer carries and none reads, and a hint that something prints them.",
        },
      ],
    },
    {
      decision: "A node's parent and children are positions, not ids.",
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
  uses: () => [
    Inspect.requireWorld,
    Path.nameInWorld,
    Path.nameNodes,
    Path.isInside,
    Failure.format,
    FileSystem.read,
    FileSystem.write,
    CheckerClient.session,
  ],
});
