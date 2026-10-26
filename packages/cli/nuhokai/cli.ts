import { node } from "@nuhokai/world";

/** The CLI in world format: loader, global rules, checks, writing. */
export const Cli = node({
  id: "01a16dd6-9f2a-7c3e-8a41-2b7d4e6f9c10",
  purpose:
    "The command surface: parse argv, print usage and dispatch to the command nodes. Owns exit codes and the " +
    "distribution, so repos need no TypeScript, Bun or node_modules. Implements no command itself.",
  status: "planned",
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
      text: "A command's exit code passes through unchanged: 0 ok, 1 diagnostics or failure, 2 usage error.",
    },
    {
      id: "R3",
      text: "No argument or a help word prints usage and exits 0; an unknown command prints usage to stderr and exits 2.",
    },
    { id: "R4", text: "Cli holds no loading, rule, tsc or writing logic: each command is its own node." },
    { id: "R5", text: "World imports are only relative files and @nuhokai/world." },
    { id: "C1", kind: "constraint", text: "No bundled language server; editors use their own." },
    { id: "C2", kind: "constraint", text: "One @nuhokai/world runtime per process." },
    { id: "C3", kind: "constraint", text: "macOS/Linux, arm64/x86_64." },
  ],
  testCases: [
    { text: "Usage lists every command; --help exits 0.", demonstrates: ["R3"] },
    { text: "An unknown command prints usage to stderr and exits 2.", demonstrates: ["R2", "R3"] },
    { text: "A command's non-zero exit code reaches the process unchanged.", demonstrates: ["R2"] },
    { text: "Empty node_modules: only authored violations.", demonstrates: ["R1"] },
    { text: "Non-relative import rejected; checker runs without node_modules.", demonstrates: ["R5"] },
  ],
  decisions: [
    {
      decision: "TS on Bun: loading means executing TS; Go would embed or spawn Bun anyway.",
      why: "Lazy edges, cycles, spreads and inherited/tbd need evaluation; static parsing loses identity; a second runtime multiplies failure modes.",
      rejected: [
        { option: "Go parser", why: "Cannot evaluate lazy edges, cycles or computed refs; no identity." },
        { option: "Go + Bun stdio", why: "Still needs Bun; adds a wire format and cross-process identity/file:line." },
      ],
    },
    {
      decision: "Per-platform binary: embeds Bun, @nuhokai/world runtime/.d.ts and matching tsc; repo needs nothing.",
      why: "Zero-toolchain adoption; the native checker is embedded per platform, never from the repo.",
      rejected: [
        { option: "npm on repo Bun/Node", why: "Forces a toolchain install." },
        { option: "repo tsc", why: "Breaks zero-toolchain; version-dependent results." },
        { option: "Windows", why: "Fifth artifact and platform code for no user." },
      ],
    },
    {
      decision: "Cli is a dispatcher; each command is a top-level node with its own port, reached by `uses`.",
      why: "Commands are separate domes with separate rules, and the dispatcher stays small and stable.",
      rejected: [
        {
          option: "command ports on Cli, delegating to children",
          why: "Delegation points down only; it would force every command under Cli and grow Cli with every command.",
        },
        {
          option: "command ports on Cli, duplicating each command's contract",
          why: "The copies drift from the nodes.",
        },
      ],
    },
    {
      decision: "No LSP. init/update write a CLI-owned tsconfig with paths and a self-contained world .d.ts.",
      why: "Editors already run TS; the gap is resolution and strict options.",
      rejected: [
        { option: "bundled lsp", why: "Duplicates editor TS; per-editor integration." },
        { option: "node_modules write", why: "Imposes a node_modules shape; paths + .d.ts suffice." },
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
      why: "Users see it after init, so the CLI uses it too; .generated is clearer than types; keeps .d.ts inside, no second similar root folder.",
      rejected: [
        { option: "world/", why: "Generic; collision-prone." },
        { option: "spec/", why: "Collides; implies prose, files are executed." },
        { option: "nuhokai-spec/", why: "Long; spec undersells executable model." },
        { option: "nuhokai/types/", why: "TS jargon; reads authored, not generated." },
        { option: "nuhokai-spec/.nuhokai/world/", why: "Nested brands/hidden; splits authored and generated." },
      ],
    },
  ],
}).edges({ uses: () => [checkCommand, Init.run, updateCommand] });
