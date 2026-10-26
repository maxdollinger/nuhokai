import { node } from "@nuhokai/world";
import { Init } from "./init.ts";

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
    {
      text: "An unknown command prints usage to stderr and exits 2; a command's non-zero exit reaches the process unchanged.",
      demonstrates: ["R2", "R3"],
    },
    {
      text: "With an empty node_modules the checker reports only authored violations and rejects a non-relative import.",
      demonstrates: ["R1", "R5"],
    },
  ],
  decisions: [
    {
      decision: "TypeScript on Bun, shipped as a per-platform binary embedding Bun, @nuhokai/world and the checker.",
      why: "Loading means executing TS (lazy edges, cycles, spreads), so Bun is required; embedding makes the repo toolchain-free.",
      rejected: [
        { option: "Go parser", why: "Cannot evaluate lazy edges, cycles or computed refs; no identity." },
        { option: "Go + Bun stdio", why: "Still needs Bun and adds a wire format." },
        { option: "repo Bun, Node or tsc", why: "Forces a toolchain install; version-dependent results." },
        { option: "Windows", why: "Fifth artifact and platform code for no user." },
      ],
    },
    {
      decision: "Cli is a dispatcher; each command is a top-level node with its own port, reached by `uses`.",
      why: "Commands are separate domes with separate rules, and the dispatcher stays small and stable.",
      rejected: [
        {
          option: "command ports on Cli, delegating to children",
          why: "Delegation points down only; every command would force itself under Cli.",
        },
        {
          option: "command ports on Cli, duplicating each command's contract",
          why: "The copies drift from the nodes.",
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
      why: "Users see it after init, so the CLI uses it too; .generated keeps authored and generated files in one root.",
      rejected: [
        { option: "world/", why: "Generic; collision-prone." },
        { option: "spec/", why: "Collides; implies prose, files are executed." },
        { option: "nuhokai/types/", why: "Reads authored, not generated." },
      ],
    },
  ],
}).edges({ uses: () => [Init.run] });
