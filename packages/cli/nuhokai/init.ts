import { defineNode } from "@nuhokai/world";
import { Scaffold } from "./scaffold.ts";

/**
 * The init boundary: one public contract, the interior free to be re-cut.
 * Inside: Scaffold (program), ResolveTarget, Inspect, Publish, ExampleWorld, CliFiles.
 */
export const Init = defineNode({
  id: "01a17233-ebfc-772d-abf4-0bd32b81656d",
  purpose:
    "Create a repo's world from nothing: nuhokai/ with an example node and world, the CLI-owned tsconfig and the " +
    "embedded @nuhokai/world types, so the loader and the editor work at once. Writes only; never checks, repairs or " +
    "updates. A boundary: run is delegated to Scaffold, which owns the program inside.",
  status: "planned",
  source: [],
  ports: {
    run: { kind: "call", purpose: "Resolve the root, then create the world there — or report that it exists" },
  },
  requirements: [
    {
      id: "R1",
      text: "The written world loads with exactly one node, Example, whose file shows a port, a tbd port and a uses edge.",
    },
    { id: "R2", text: "After init, the editor's TypeScript resolves @nuhokai/world and the world's strict options." },
    { id: "R3", text: "All-or-nothing: a failure leaves no nuhokai/ behind and no temporary path." },
    {
      id: "R4",
      text: "Exactly nuhokai/index.ts, nuhokai/example.ts, nuhokai/tsconfig.json and nuhokai/.generated/world/index.d.ts, nothing outside the folder.",
    },
    {
      id: "R5",
      text: "An existing nuhokai/ directory stays untouched, exit 0 with one line; a file at that path is one stderr line and exit 1.",
    },
    {
      id: "R6",
      text: "Byte-identical output per CLI version: constant template ids, no timestamps, nothing generated per run.",
    },
    {
      id: "R7",
      text: "No TypeScript, Bun, node_modules or network in the repo; the only process init may spawn is git.",
    },
    {
      id: "R8",
      text: "The four files are staged first and published in one step; the world is never visible half-written.",
    },
    { id: "C1", kind: "constraint", text: "No flags in v1; confirming a cwd fallback is the only interaction." },
  ],
  testCases: [
    {
      text: "In an empty Git repo with no node_modules and no network, init writes the four files and exits 0; two repos get identical bytes.",
      demonstrates: ["R4", "R6", "R7"],
    },
    { text: "Loading the written nuhokai/index.ts yields a world containing one node, Example.", demonstrates: ["R1"] },
    {
      text: "After init, the editor resolves @nuhokai/world through nuhokai/tsconfig.json and .generated/world.",
      demonstrates: ["R2"],
    },
    {
      text: "An existing nuhokai/ stays unchanged, exit 0 with one line; a file named nuhokai gives one stderr line and exit 1.",
      demonstrates: ["R5"],
    },
    {
      text: "Without git and without a terminal, init writes nothing and exits 1; on a terminal, 'no' writes nothing and 'yes' uses the cwd.",
      demonstrates: ["C1", "R3"],
    },
    { text: "A failed write into an unwritable root leaves no partial nuhokai/.", demonstrates: ["R3", "R8"] },
  ],
  decisions: [
    {
      decision: "An existing nuhokai/ directory is a no-op, exit 0, not an error.",
      why: "Scripts and agents re-run init; once the world exists the answer is always 'nothing to do', and changing files is update's job.",
      rejected: [
        { option: "Error when the folder exists", why: "Common re-runs would fail for no reason." },
        { option: "Fill in the missing files", why: "That is update, and it would mix generated and authored files." },
      ],
    },
    {
      decision: "Init only writes; it never runs the checker.",
      why: "`check` owns diagnostics and one list, and init has to work before the checker exists.",
      rejected: [
        { option: "Run check after writing", why: "Two commands printing diagnostics, plus a needless dependency." },
      ],
    },
    {
      decision: "No flags in v1.",
      why: "Every knob is a guess about an unshown need; the cwd confirmation covers the one real ambiguity.",
      rejected: [
        { option: "--dir", why: "Git root plus confirmation resolves the root." },
        { option: "--force", why: "Nothing is ever overwritten." },
      ],
    },
    {
      decision: "Init is a boundary, not a step: run is delegated to Scaffold, and the interior is a dome of domains.",
      why: "The outside sees one contract; the interior (target, inspect, publish, example, cli files) re-cuts without touching Cli, the command name or these requirements.",
      rejected: [
        {
          option: "Init's body as loose code",
          why: "The interior stays unreadable in the map and its boundaries stay undecided.",
        },
        {
          option: "One port per interior domain, sequenced by Cli",
          why: "The interior leaks; sequencing on the boundary is public.",
        },
      ],
    },
    {
      decision: "CliFiles sits inside the boundary; building update moves it top level or gives update its own writer.",
      why: "Update refreshes the same two files, but nothing inside Init's dome is reachable from a sibling command.",
      rejected: [
        { option: "Duplicate the writer per command", why: "The two outputs could drift." },
        { option: "Top-level now", why: "A second caller that does not exist yet decides nothing." },
      ],
    },
  ],
  delegate: { run: () => Scaffold.run },
}).edges({});
