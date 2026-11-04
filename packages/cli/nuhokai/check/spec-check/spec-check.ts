import { node } from "@nuhokai/world";
import { ApplyRules } from "./apply-rules.ts";
import { DataRules } from "./data-rules.ts";
import { SourceRules } from "./source-rules.ts";

/** The spec check. Inside: ApplyRules (program), DataRules, SourceRules. */
export const SpecCheck = node({
  id: "01a18319-8a01-7669-8f66-8435e312227e",
  purpose: "Prove the loaded world is a valid spec, so the code can be checked against it.",
  status: "building",
  source: ["src/check/spec-check/**"],
  requirements: [
    {
      id: "R1",
      text: "Every id is unique in the world, the world's own id included. A node listed in two places is a violation at the second listing, naming both places with their file:line, the node in the node part only. Every other rule skips nodes whose id is duplicated.",
    },
    {
      id: "R2",
      text: "Judges only nodes reachable from the world. An exported node that is not is a warning at its node() call, never an error.",
    },
    {
      id: "R3",
      text: "A uses edge targets a port of a sibling or of an ancestor's sibling, the top level included, never a node inside one. Any other target is a violation naming the edge.",
    },
    {
      id: "R4",
      text: "Node names are unique among siblings, the top level included. A node's name in diagnostics is its path from the world, Check/SpecCheck. A clash is a violation naming both files.",
    },
    {
      id: "R5",
      text: "Rules tsc leaves to check (non-literal ids and flags, per packages/world/README.md) hold in the loaded world; each break is a violation. Left out after a TypeCheck error: tsc has then reported what they would, and they would say it twice.",
    },
    {
      id: "R6",
      text: "Every source entry, relative to the project directory, matches at least one file; one matching nothing is a violation naming the node and the entry.",
    },
    {
      id: "R7",
      text: "A file matched by the source of two nodes, under any name a symlink gives it, is a violation naming both and the file, unless one is the other's ancestor.",
    },
    { id: "R8", text: "Every violation states its fix, listing alternatives when there is a choice." },
    {
      id: "R9",
      text: "A node with status building or built, not external or abstract, lists at least one source entry.",
    },
    {
      id: "R10",
      text: "Every file a node's source matches is matched by the world's source, under any name a symlink gives it; the world's entries stay inside the project directory and follow R6. Else an error naming the node or the world, and the entry.",
    },
    {
      id: "R11",
      text: "Every implements target is reachable; else an error naming the edge. That it is abstract is tsc's, re-checked by R5.",
    },
    {
      id: "R12",
      text: "The world's id and a node's id, name, port names, requirement ids and source entries hold no whitespace (a space, tab, line break or any other Unicode whitespace), nor does the name of a file a node's source matches; each is an error naming the node or the world and the value, with the fix. A rule tsc leaves to check, but not a re-check of tsc's (R5): it holds after a type error too. Review cites these as written, so with check clean every reference and file name prints and round-trips as is; test case and decision references are indices, and other names are identifiers.",
    },
  ],
  testCases: [
    {
      text: "A node listed in the world and in a dome → one error naming nuhokai/index.ts and the dome's file.",
      demonstrates: ["R1"],
    },
    {
      text: "An exported node missing from index.ts → one warning at its file and line, exit 0; its own broken edges go unreported.",
      demonstrates: ["R2"],
    },
    {
      text: "A leaf using a port of a sibling's child → error naming the edge; the same port exposed by the sibling passes.",
      demonstrates: ["R3"],
    },
    {
      text: "Two children of one dome named Store → error naming both files; Store under two domes passes as Orders/Store and Stock/Store.",
      demonstrates: ["R4"],
    },
    {
      text: "Two requirements whose ids come from one variable, equal at load → error naming the node.",
      demonstrates: ["R5"],
    },
    {
      text: "source ['src/gone/**'] → error naming the node and the entry; under --path app it resolves in app/, not the cwd.",
      demonstrates: ["R6"],
    },
    {
      text: "Two siblings claiming src/shared.ts → error naming both and the file; a dome's src/map/** over its child's src/map/draw-map.ts passes.",
      demonstrates: ["R7"],
    },
    {
      text: "An out-of-scope uses edge → its fix lists both ways out: expose the port through the parent, or move the node.",
      demonstrates: ["R3", "R8"],
    },
    {
      text: "A built leaf with source [] → error naming the node; the same planned, or an external, passes.",
      demonstrates: ["R9"],
    },
    {
      text: "World source ['src/**'], a node claiming scripts/x.ts → error naming the node and the entry; world source ['../shared/**'] → error naming the world.",
      demonstrates: ["R10"],
    },
    {
      text: "Orders implements a contract listed nowhere → error naming the edge; implementing a non-abstract node → error.",
      demonstrates: ["R11"],
    },
    {
      text: 'A requirement id "R  1", a node id "a 1", a port named with a no-break space, a world id holding a tab and a source entry "src/a b.ts" → one error each, naming the value with its whitespace escaped; a node entry src/*.ts matching src/a b.ts → an error naming the entry and the file.',
      demonstrates: ["R12"],
    },
    {
      text: "A child copy-pasted with its parent's id → one R1 error; no scope, name or ownership findings for that id.",
      demonstrates: ["R1"],
    },
  ],
  decisions: [
    {
      decision: "Whitespace in an id, a name, a source entry or a source file's name is always an error (R12).",
      why: "Review cites references and files as written and prints them on one line; with no whitespace in them, printing, quoting and taking them back need no rules of their own.",
      rejected: [
        {
          option: "Review quotes or escapes whitespace in what it cites",
          why: "Every reader of a reference or a finding line would need the same unquoting; a spec has no need for whitespace there.",
        },
      ],
    },
    {
      decision: "One owner per file, nesting aside.",
      why: "CodeCheck attributes code to one node; shared code is its own node.",
      rejected: [{ option: "Siblings share files", why: "Couples past ports." }],
    },
    {
      decision: "Rule groups by what they read, wired by ApplyRules's uses edges.",
      why: "A new group needs a new input, which is rare; the wiring stays visible without a contract.",
      rejected: [
        { option: "A Rule contract and a RuleEngine", why: "Two nodes for a set of groups that hardly grows." },
      ],
    },
    {
      decision: "A file may belong to no node; a node's source must exist (R6).",
      why: "Generated and glue files need no owner; a source entry pointing nowhere is a broken spec.",
    },
    {
      decision: "No FormatRules: TypeCheck forbids casts and @ts- directives, so tsc's rules hold.",
      why: "Re-implementing every tsc rule on data would be SpecCheck's largest part and drift with the format.",
      rejected: [{ option: "FormatRules re-checks every tsc rule", why: "A second copy of the rules." }],
    },
  ],
  children: [ApplyRules, DataRules, SourceRules],
  ports: { run: ApplyRules.run },
}).edges({});
