import { node } from "@nuhokai/world";
import { Init } from "./init/init.ts";
import { WorldMap } from "./map/world-map.ts";
import { New } from "./new/new.ts";

/** The CLI in world format: loader, global rules, checks, writing. */
export const Cli = node({
  id: "01a16dd6-9f2a-7c3e-8a41-2b7d4e6f9c10",
  purpose:
    "Command surface: parse argv, print usage, dispatch to command nodes; owns exit codes and the distribution. " +
    "Implements no command.",
  status: "building",
  source: ["packages/cli/src/**", "packages/cli/scripts/**"],
  ports: {
    dispatch: {
      kind: "call",
      purpose: "Parse argv, run the matching command node",
      input: "argv without the executable",
      output: "exit code: 0 ok, 1 diagnostics or failure, 2 usage error",
      errors: ["unknown command"],
    },
  },
  requirements: [
    { id: "R1", text: "A repo needs no TypeScript, Bun or node_modules; the CLI ships its own pinned checker." },
    {
      id: "R2",
      text: "Command exit codes pass through unchanged: 0 ok, 1 failure or diagnostics, 2 usage or argument error.",
    },
    {
      id: "R3",
      text: "No argument, help, --help or -h → usage, exit 0. Usage lists every command with its argument form and a one-line description; `nuhokai <command> --help` (or -h) repeats that form, exit 0; after a command `help` is an ordinary argument. Unknown command → usage on stderr, exit 2.",
    },
    { id: "R4", text: "No loading, rule, tsc or writing logic in Cli: each command is its own node." },
    {
      id: "R5",
      text: "World imports type-check only as relative files and @nuhokai/world; the CLI runs with bun --no-install, so nothing is installed.",
    },
    {
      id: "R6",
      text: "Cli enforces argument counts: init, check, update, map none; new exactly one. Wrong count → argument error (2), command never runs. Arguments pass through unchanged, never validated.",
    },
    {
      id: "R7",
      text: "Every command works in one project directory: --path <dir> (or --path=<dir>) against the cwd, else the cwd. Missing value, second --path or a path that is no directory → usage error (2), command never runs. The command gets the directory, never the cwd, and prints its paths cwd-relative.",
    },
    { id: "C1", kind: "constraint", text: "No bundled language server; editors use their own." },
    { id: "C2", kind: "constraint", text: "One @nuhokai/world runtime per process." },
    { id: "C3", kind: "constraint", text: "macOS/Linux, arm64/x86_64." },
  ],
  testCases: [
    {
      text: "Usage lists every command with its argument form (`nuhokai new <node-path>` visible); --help, `nuhokai init --help`, `nuhokai new --help` exit 0.",
      demonstrates: ["R3"],
    },
    {
      text: "Unknown command → usage on stderr, exit 2; a command's non-zero exit reaches the process unchanged.",
      demonstrates: ["R2", "R3"],
    },
    {
      text: "`nuhokai new new/stock-order` passes new/stock-order to New unchanged; `nuhokai new`, `nuhokai new a b` → argument error, New never runs.",
      demonstrates: ["R6"],
    },
    {
      text: "Empty node_modules: the checker reports only authored violations and rejects a non-relative import.",
      demonstrates: ["R1", "R5"],
    },
    {
      text: "`nuhokai map` runs WorldMap with the cwd; `nuhokai map x` → argument error, WorldMap never runs.",
      demonstrates: ["R6"],
    },
    {
      text: "From a parent directory: `init --path packages/app` writes packages/app/nuhokai/, `map --path=packages/app` maps it; --path without value, twice or naming no directory (missing path, file, file/x) → exit 2, nothing runs; `map --path x --help` prints map's help.",
      demonstrates: ["R7"],
    },
    {
      text: "`nuhokai help` prints usage; `nuhokai new help` writes nuhokai/help.ts; `nuhokai map help` → argument error, exit 2.",
      demonstrates: ["R3", "R6"],
    },
  ],
  decisions: [
    {
      decision: "TypeScript on Bun, shipped as a per-platform binary embedding Bun, @nuhokai/world and the checker.",
      why: "Loading executes TS (lazy edges, cycles, spreads), so Bun is required; embedding keeps the repo toolchain-free.",
      rejected: [
        { option: "Go parser", why: "Cannot evaluate lazy edges, cycles or computed refs; no identity." },
        { option: "repo Bun, Node or tsc", why: "Forces a toolchain install; version-dependent results." },
      ],
    },
    {
      decision: "Cli is a dispatcher; each command is a top-level node with its own port, reached by `uses`.",
      why: "Commands are separate domes with separate rules; the dispatcher stays small and stable.",
      rejected: [
        {
          option: "command ports on Cli",
          why: "Delegation points down only; duplicating each contract on the dispatcher drifts from the nodes.",
        },
      ],
    },
    {
      decision: "Exit 2: wrong command, flag or argument count, or a command's invalid argument value.",
      why: "One code for 'invocation wrong' keeps scripts to two branches: Cli owns the call's shape, the command its values.",
      rejected: [
        {
          option: "A fourth code for invalid values",
          why: "More states than scripts use; the stderr line already says which.",
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
      decision: "One folder nuhokai/ (layout: WorldPath), same for users and this package.",
      why: "Users see it after init, so the CLI uses it too; .generated keeps authored and generated files in one folder.",
      rejected: [{ option: "world/ or spec/", why: "Generic or collision-prone names for executed files." }],
    },
    {
      decision: "Project directory = the cwd or --path; nothing else.",
      why: "One rule, no guessing or interaction; any folder holding nuhokai/ is one, also a package in a monorepo.",
      rejected: [
        {
          option: "The Git root, else the cwd after a yes/no prompt",
          why: "Cannot reach a world below the root; needs git and a terminal.",
        },
      ],
    },
  ],
}).edges({ uses: () => [Init.run, New.run, WorldMap.run] });
