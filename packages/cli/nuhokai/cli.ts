import { defineNode } from "@nuhokai/world";

/** The CLI in world format: loader, global rules, checks, writing. */
export const Cli = defineNode({
  id: "01a16dd6-9f2a-7c3e-8a41-2b7d4e6f9c10",
  purpose:
    "Loads a repo's nuhokai folder into one checked, navigable model. Owns the toolchain (loader, tsc, world " +
    "types), so repos need no TypeScript, Bun or node_modules.",
  status: "planned",
  source: ["packages/cli/src/**"],
  ports: {
    check: {
      kind: "call",
      purpose: "Load world, run rules and tsc, print one diagnostics list",
      input: "repo root, nuhokai folder",
      output: "diagnostics (file:line, node, reason); exit 1 if any",
      errors: ["missing entry", "missing embedded tsc or types"],
    },
    init: {
      kind: "call",
      purpose: "Write skeleton, tsconfig, embedded world types",
      input: "repo root, nuhokai folder",
      output: "nuhokai/index.ts, nuhokai/tsconfig.json, nuhokai/.generated/world/index.d.ts",
      errors: ["files exist"],
    },
    sync: {
      kind: "call",
      purpose: "Refresh tsconfig, embedded types",
      input: "repo root, nuhokai folder",
      output: "updated nuhokai/tsconfig.json, nuhokai/.generated/world/index.d.ts",
    },
  },
  requirements: [
    { id: "R1", text: "check needs no TypeScript, Bun or node_modules in the repo." },
    { id: "R2", text: "Loader evaluates nuhokai/index.ts; references resolve by object identity." },
    { id: "R3", text: "tsc and rule diagnostics print as one list; each has file:line and one sentence." },
    { id: "R4", text: "Editor TypeScript resolves @nuhokai/world and strict options after init/sync." },
    { id: "R5", text: "Deterministic checker: the CLI ships its own pinned tsc, never the repo's." },
    { id: "R6", text: "World imports are only relative files and @nuhokai/world." },
    { id: "C1", kind: "constraint", text: "No bundled language server; editors use their own." },
    { id: "C2", kind: "constraint", text: "One @nuhokai/world runtime per process." },
    { id: "C3", kind: "constraint", text: "macOS/Linux, arm64/x86_64." },
  ],
  testCases: [
    { text: "Empty node_modules: only authored violations.", demonstrates: ["R1", "R5"] },
    { text: "Cycle + placeholder + inherited port; every reference resolves by identity.", demonstrates: ["R2", "C2"] },
    { text: "Duplicate id, orphan, out-of-scope use: three diagnostics, one list.", demonstrates: ["R3"] },
    { text: "After init, tsconfig paths resolve @nuhokai/world in the editor.", demonstrates: ["R4"] },
    { text: "Non-relative import rejected; checker needs no node_modules.", demonstrates: ["R6"] },
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
      decision: "No LSP. init/sync write CLI-owned tsconfig with paths and a self-contained world .d.ts.",
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
}).edges({});
