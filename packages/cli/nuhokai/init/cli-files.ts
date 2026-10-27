import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";

/** The files the CLI itself owns inside a world. */
export const CliFiles = node({
  id: "01a17290-3f10-7c53-9e36-4a70c8b21d5f",
  purpose:
    "Own the CLI's files in a world: editor tsconfig and embedded @nuhokai/world declarations, so editors resolve " +
    "the format without node_modules. Never picks the directory.",
  status: "built",
  source: ["packages/cli/src/init/cli-files.ts"],
  ports: {
    write: {
      kind: "call",
      purpose: "Write the CLI-owned files",
      input: "an existing directory",
      output: "which of tsconfig.json and .generated/world/index.d.ts (in nuhokai/) were written vs already identical",
      errors: ["directory not writable"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Exactly two files in the project directory: nuhokai/tsconfig.json, nuhokai/.generated/world/index.d.ts.",
    },
    { id: "R2", text: "tsconfig: strict options and the @nuhokai/world path mapping to .generated/world." },
    {
      id: "R3",
      text: ".d.ts emitted from @nuhokai/world at build time and embedded, self-contained: no node_modules or repo resolution.",
    },
    { id: "R4", text: "Byte-identical per CLI version; identical files are not rewritten." },
    { id: "C1", kind: "constraint", text: "Writes nothing outside the given directory." },
  ],
  testCases: [
    {
      text: "After a write, tsc resolves @nuhokai/world through the two files alone; the .d.ts matches the declarations emitted from @nuhokai/world.",
      demonstrates: ["R1", "R2", "R3"],
    },
    {
      text: "Second write into unchanged files rewrites nothing and says so; two runs → identical bytes.",
      demonstrates: ["R4"],
    },
  ],
  decisions: [
    {
      decision: "One node owns both files: tsconfig (R2) and the build-time .d.ts (R3).",
      why: "Same owner, trigger (CLI version) and refresh policy. Editors already run TS; the gap is resolution and strict options. A test comparing the embedded .d.ts with the package prevents drift.",
      rejected: [
        { option: "node_modules write", why: "Imposes a node_modules shape." },
        { option: "hand-written .d.ts", why: "Drifts from the runtime and misses brand errors." },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
