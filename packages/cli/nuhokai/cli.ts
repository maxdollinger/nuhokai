import { node } from "@nuhokai/world";
import { Init } from "./init/init.ts";
import { WorldMap } from "./map/world-map.ts";
import { New } from "./new/new.ts";

/** The CLI in world format: loader, global rules, checks, writing. */
export const Cli = node({
  id: "01a16dd6-9f2a-7c3e-8a41-2b7d4e6f9c10",
  purpose:
    "The command surface: parse argv, print usage and dispatch to the command nodes. Owns exit codes and the " +
    "distribution, so repos need no TypeScript, Bun or node_modules. Implements no command itself.",
  status: "building",
  source: ["packages/cli/src/**", "packages/cli/scripts/**"],
  ports: {
    dispatch: {
      kind: "call",
      purpose: "Parse argv and run the matching command node",
      input: "argv without the executable",
      output: "exit code: 0 ok, 1 diagnostics or failure, 2 usage error",
      errors: ["unknown command"],
    },
  },
  requirements: [
    { id: "R1", text: "A repo needs no TypeScript, Bun or node_modules; the CLI ships its own pinned checker." },
    {
      id: "R2",
      text: "A command's exit code passes through unchanged: 0 ok, 1 failure or diagnostics, 2 usage or argument error.",
    },
    {
      id: "R3",
      text: "No argument or a help word prints usage and exits 0. Usage lists every command with its argument form and a one-line description, and `nuhokai <command> --help` repeats that form; both exit 0. An unknown command prints usage to stderr and exits 2.",
    },
    { id: "R4", text: "Cli holds no loading, rule, tsc or writing logic: each command is its own node." },
    { id: "R5", text: "World imports are only relative files and @nuhokai/world." },
    {
      id: "R6",
      text: "Cli enforces the argument count per command: init, check, update and map take none, new takes exactly one. A wrong count is an argument error (2) and the command never runs; the arguments are passed through unchanged and never validated.",
    },
    {
      id: "R7",
      text: "Every command works in one project directory: --path <dir> (or --path=<dir>) against the cwd, else the cwd. A missing value, a second --path or a path that is no directory is a usage error (2) and the command never runs; the command gets the directory, never the cwd, and prints its paths named from the cwd.",
    },
    { id: "C1", kind: "constraint", text: "No bundled language server; editors use their own." },
    { id: "C2", kind: "constraint", text: "One @nuhokai/world runtime per process." },
    { id: "C3", kind: "constraint", text: "macOS/Linux, arm64/x86_64." },
  ],
  testCases: [
    {
      text: "Usage lists every command with its argument form, so `nuhokai new <node-path>` is visible; --help, `nuhokai init --help` and `nuhokai new --help` exit 0.",
      demonstrates: ["R3"],
    },
    {
      text: "An unknown command prints usage to stderr and exits 2; a command's non-zero exit reaches the process unchanged.",
      demonstrates: ["R2", "R3"],
    },
    {
      text: "`nuhokai new new/stock-order` passes new/stock-order to New unchanged; `nuhokai new` and `nuhokai new a b` are argument errors and New never runs.",
      demonstrates: ["R6"],
    },
    {
      text: "With an empty node_modules the checker reports only authored violations and rejects a non-relative import.",
      demonstrates: ["R1", "R5"],
    },
    {
      text: "`nuhokai map` runs WorldMap with the cwd; `nuhokai map x` is an argument error and WorldMap never runs.",
      demonstrates: ["R6"],
    },
    {
      text: "From a parent directory, `init --path packages/app` writes packages/app/nuhokai/ and `map --path=packages/app` maps it; --path without a value, twice or naming no directory (a missing path, a file, file/x) exits 2 and nothing runs; `map --path x --help` prints map's help.",
      demonstrates: ["R7"],
    },
  ],
  decisions: [
    {
      decision: "TypeScript on Bun, shipped as a per-platform binary embedding Bun, @nuhokai/world and the checker.",
      why: "Loading means executing TS (lazy edges, cycles, spreads), so Bun is required; embedding makes the repo toolchain-free.",
      rejected: [
        { option: "Go parser", why: "Cannot evaluate lazy edges, cycles or computed refs; no identity." },
        { option: "repo Bun, Node or tsc", why: "Forces a toolchain install; version-dependent results." },
      ],
    },
    {
      decision: "Cli is a dispatcher; each command is a top-level node with its own port, reached by `uses`.",
      why: "Commands are separate domes with separate rules, and the dispatcher stays small and stable.",
      rejected: [
        {
          option: "command ports on Cli",
          why: "Delegation points down only, and duplicating each contract on the dispatcher drifts from the nodes.",
        },
      ],
    },
    {
      decision: "Exit 2 covers a wrong command, flag or argument count and a command's invalid argument value.",
      why: "One code for 'the invocation was wrong' keeps scripts to two branches: Cli owns the shape of the call, the command owns its value.",
      rejected: [
        {
          option: "A fourth code for invalid values",
          why: "More states than a script can use; the stderr line already says which.",
        },
      ],
    },
    {
      decision: "Imports: relative files and @nuhokai/world only; CLI owns the tsconfig.",
      why: "Embedded .d.ts and paths suffice; independent of the repo's dependency graph.",
      rejected: [
        { option: "arbitrary packages", why: "Checker needs repo resolution and TypeScript." },
        { option: "repo tsconfig", why: "Could weaken strict mode or resolution." },
      ],
    },
    {
      decision:
        "One folder nuhokai/: index.ts, nodes, tsconfig.json, .generated/world/. Same for users and this package.",
      why: "Users see it after init, so the CLI uses it too; .generated keeps authored and generated files in one folder.",
      rejected: [{ option: "world/ or spec/", why: "Generic or collision-prone names for executed files." }],
    },
    {
      decision: "The project directory is the cwd or --path; nothing else.",
      why: "One rule with no guessing and no interaction; any folder holding nuhokai/ is a project directory, also a package inside a monorepo.",
      rejected: [
        {
          option: "The Git root, else the cwd after a yes/no prompt",
          why: "Cannot reach a world below the root, and needs git and a terminal.",
        },
      ],
    },
  ],
}).edges({ uses: () => [Init.run, New.run, WorldMap.run] });
