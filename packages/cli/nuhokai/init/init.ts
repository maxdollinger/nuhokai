import { node } from "@nuhokai/world";
import { CliFiles } from "./cli-files.ts";
import { ExampleWorld } from "./example-world.ts";
import { Publish } from "./publish.ts";
import { Scaffold } from "./scaffold.ts";

/**
 * The init boundary: one public contract, the interior free to be re-cut.
 * Inside: Scaffold (program), Publish, ExampleWorld, CliFiles.
 * Inspect, WorldPath and Failure are shared top-level nodes.
 */
export const Init = node({
  id: "01a17233-ebfc-772d-abf4-0bd32b81656d",
  purpose:
    "Create a repo's world from nothing: nuhokai/ with an example node and world, the CLI-owned tsconfig and the " +
    "embedded @nuhokai/world types, so the loader and the editor work at once. Writes only; never checks, repairs or " +
    "updates. A boundary: run is delegated to Scaffold; target, layout and failure concerns are shared top-level nodes.",
  status: "building",
  source: ["packages/cli/src/init/**"],
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
      text: "An existing nuhokai/ directory stays untouched, exit 0 with one line; anything else at that path is one stderr line and exit 1.",
    },
    {
      id: "R6",
      text: "No TypeScript, Bun, node_modules or network in the repo; init spawns nothing.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "No flags reach run: Cli answers --help and --path; init asks nothing.",
    },
  ],
  testCases: [
    {
      text: "In an empty directory with no node_modules and no network, init writes the four files and exits 0; two repos get identical bytes, and the result type-checks and loads as one node, Example.",
      demonstrates: ["R1", "R4", "R6"],
    },
    {
      text: "After init, the editor resolves @nuhokai/world through nuhokai/tsconfig.json and .generated/world.",
      demonstrates: ["R2"],
    },
    {
      text: "An existing nuhokai/ stays unchanged, exit 0 with one line; a file or a symlink named nuhokai gives one stderr line and exit 1.",
      demonstrates: ["R5"],
    },
    {
      text: "A failed write leaves no partial nuhokai/ or temporary path.",
      demonstrates: ["R3"],
    },
  ],
  decisions: [
    {
      decision: "An existing nuhokai/ is a no-op (exit 0); init only writes, never checks.",
      why: "Scripts and agents re-run init; once the world exists the answer is 'nothing to do' and changing files is update's job. Check owns diagnostics.",
      rejected: [
        { option: "Error when the folder exists", why: "Common re-runs would fail for no reason." },
        {
          option: "Fill in missing files or run check",
          why: "Update and check own that; init would mix generated and authored files.",
        },
        {
          option: "A --force flag",
          why: "Nothing is ever overwritten.",
        },
      ],
    },
    {
      decision:
        "Init is a boundary dome: run delegates to Scaffold. Target queries, the world layout and the failure line are top-level nodes, shared with New; CliFiles is Init's until update needs it.",
      why: "One public contract, one owner per shared concern, and an interior that re-cuts without touching Cli.",
      rejected: [
        { option: "Init's body as loose code", why: "The interior stays unreadable in the map." },
        {
          option: "Duplicate Inspect inside New",
          why: "Two owners of one behavior and two copies to drift.",
        },
        {
          option: "One port per interior domain, sequenced by Cli",
          why: "The interior leaks; sequencing becomes public.",
        },
      ],
    },
  ],
  children: {
    scaffold: Scaffold,
    publish: Publish,
    exampleWorld: ExampleWorld,
    cliFiles: CliFiles,
  },
  ports: (c) => ({ run: c.scaffold.ports.run }),
}).edges({});
