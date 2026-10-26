import { node } from "@nuhokai/world";
import { CliFiles } from "./cli-files.ts";
import { ExampleWorld } from "./example-world.ts";
import { Inspect } from "./inspect.ts";
import { Publish } from "./publish.ts";
import { ResolveTarget } from "./resolve-target.ts";
import { Scaffold } from "./scaffold.ts";

/**
 * The init boundary: one public contract, the interior free to be re-cut.
 * Inside: Scaffold (program), ResolveTarget, Inspect, Publish, ExampleWorld, CliFiles.
 */
export const Init = node({
  id: "01a17233-ebfc-772d-abf4-0bd32b81656d",
  purpose:
    "Create a repo's world from nothing: nuhokai/ with an example node and world, the CLI-owned tsconfig and the " +
    "embedded @nuhokai/world types, so the loader and the editor work at once. Writes only; never checks, repairs or " +
    "updates. A boundary: run is delegated to Scaffold.",
  status: "planned",
  source: [],
  requirements: [
    {
      id: "R1",
      text: "The written world type-checks and loads with exactly one node, Example, whose file shows a port, a tbd port and a uses edge.",
    },
    { id: "R2", text: "After init, the editor's TypeScript resolves @nuhokai/world and the world's strict options." },
    {
      id: "R3",
      text: "All-or-nothing: content is staged and committed in one step; a failure leaves no nuhokai/ and no temporary path.",
    },
    {
      id: "R4",
      text: "Exactly nuhokai/index.ts, nuhokai/example.ts, nuhokai/tsconfig.json and nuhokai/.generated/world/index.d.ts, nothing outside the folder; byte-identical per CLI version.",
    },
    {
      id: "R5",
      text: "An existing nuhokai/ directory stays untouched, exit 0 with one line; a file at that path is one stderr line and exit 1.",
    },
    {
      id: "R6",
      text: "No TypeScript, Bun, node_modules or network in the repo; the only process init may spawn is git.",
    },
    { id: "C1", kind: "constraint", text: "No flags in v1; confirming a cwd fallback is the only interaction." },
  ],
  testCases: [
    {
      text: "In an empty Git repo with no node_modules and no network, init writes the four files and exits 0; two repos get identical bytes, and the result type-checks and loads as one node, Example.",
      demonstrates: ["R1", "R4", "R6"],
    },
    {
      text: "After init, the editor resolves @nuhokai/world through nuhokai/tsconfig.json and .generated/world.",
      demonstrates: ["R2"],
    },
    {
      text: "An existing nuhokai/ stays unchanged, exit 0 with one line; a file named nuhokai gives one stderr line and exit 1.",
      demonstrates: ["R5"],
    },
    {
      text: "Without git and without a terminal, init writes nothing and exits 1; on a terminal, 'no' writes nothing and 'yes' uses the cwd; a failed write leaves no partial nuhokai/ or temporary path.",
      demonstrates: ["R3", "C1"],
    },
  ],
  decisions: [
    {
      decision: "An existing nuhokai/ is a no-op (exit 0); v1 has no flags and only writes, never checks.",
      why: "Scripts and agents re-run init; once the world exists the answer is 'nothing to do' and changing files is update's job. Check owns diagnostics, and the cwd confirmation covers the only real ambiguity.",
      rejected: [
        { option: "Error when the folder exists", why: "Common re-runs would fail for no reason." },
        {
          option: "Fill in missing files or run check",
          why: "Update and check own that; init would mix generated and authored files.",
        },
        { option: "--dir", why: "Git root plus confirmation resolves the root." },
        { option: "--force", why: "Nothing is ever overwritten." },
      ],
    },
    {
      decision: "Init is a boundary dome: run delegates to Scaffold, and CliFiles stays inside until update needs it.",
      why: "The outside sees one contract; the interior re-cuts without touching Cli or these requirements. Update is the second caller that decides promotion.",
      rejected: [
        { option: "Init's body as loose code", why: "The interior stays unreadable in the map." },
        {
          option: "One port per interior domain, sequenced by Cli",
          why: "The interior leaks; sequencing becomes public.",
        },
        { option: "Top-level CliFiles now", why: "A second caller that does not exist yet decides nothing." },
        { option: "Duplicate the writer per command", why: "The two outputs could drift." },
      ],
    },
  ],
  children: {
    scaffold: Scaffold,
    resolveTarget: ResolveTarget,
    inspect: Inspect,
    publish: Publish,
    exampleWorld: ExampleWorld,
    cliFiles: CliFiles,
  },
  ports: (c) => ({ run: c.scaffold.ports.run }),
}).edges({});
