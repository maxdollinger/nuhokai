import { node } from "@nuhokai/world";

/** The files the CLI itself owns inside a world. */
export const CliFiles = node({
  id: "01a17290-3f10-7c53-9e36-4a70c8b21d5f",
  purpose:
    "Own every file the CLI itself owns in a world: the editor tsconfig and the embedded @nuhokai/world " +
    "declarations, so the editor resolves the format without node_modules. Never decides which directory.",
  status: "planned",
  source: [],
  ports: {
    write: {
      kind: "call",
      purpose: "Lay down the CLI-owned files",
      input: "an existing directory",
      output: "which of tsconfig.json and .generated/world/index.d.ts were written, and which were already identical",
      errors: ["the directory is not writable", "the embedded world types are missing"],
    },
  },
  requirements: [
    { id: "R1", text: "Exactly tsconfig.json and .generated/world/index.d.ts, relative to the given directory." },
    { id: "R2", text: "tsconfig: the strict options and the @nuhokai/world path mapping to .generated/world." },
    {
      id: "R3",
      text: "The .d.ts is emitted from @nuhokai/world at build time and embedded, self-contained: no node_modules, no repo resolution.",
    },
    { id: "R4", text: "Byte-identical per CLI version; identical files are not rewritten." },
    { id: "C1", kind: "constraint", text: "Writes nothing outside the given directory." },
  ],
  testCases: [
    {
      text: "After a write, tsc resolves @nuhokai/world through the two files alone, and the .d.ts matches the declarations emitted from @nuhokai/world.",
      demonstrates: ["R1", "R2", "R3"],
    },
    {
      text: "A second write into unchanged files rewrites nothing and says so; two runs give identical bytes.",
      demonstrates: ["R4"],
    },
  ],
  decisions: [
    {
      decision: "One node for both files.",
      why: "Same owner, same trigger (CLI version), same refresh policy; only the file name differs.",
      rejected: [{ option: "One node per file", why: "Two nodes whose only difference is a path." }],
    },
    {
      decision: "A tsconfig with paths plus a self-contained .d.ts emitted from @nuhokai/world, no node_modules write.",
      why: "Editors already run TS; the gap is resolution and strict options. A test compares the embedded .d.ts with the package, so it cannot drift.",
      rejected: [
        { option: "bundled LSP", why: "Duplicates editor TS." },
        { option: "node_modules write", why: "Imposes a node_modules shape." },
        { option: "hand-written .d.ts", why: "Drifts from the runtime and misses brand errors." },
      ],
    },
  ],
}).edges({});
