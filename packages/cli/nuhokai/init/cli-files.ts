import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";

/** The files the CLI itself owns inside a world. */
export const CliFiles = node({
  id: "01a17290-3f10-7c53-9e36-4a70c8b21d5f",
  purpose:
    "Own every file the CLI itself owns in a world: the editor tsconfig and the embedded @nuhokai/world " +
    "declarations, so the editor resolves the format without node_modules. Never decides which directory.",
  status: "built",
  source: ["packages/cli/src/init/cli-files.ts"],
  ports: {
    write: {
      kind: "call",
      purpose: "Lay down the CLI-owned files",
      input: "an existing directory",
      output:
        "which of tsconfig.json and .generated/world/index.d.ts, inside the world folder, were written, and which were already identical",
      errors: ["the directory is not writable"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Exactly two files, nuhokai/tsconfig.json and nuhokai/.generated/world/index.d.ts in the project directory; nothing outside the given directory.",
    },
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
      decision:
        "One node owning both files: a tsconfig with the strict options and the @nuhokai/world path mapping, plus a self-contained .d.ts emitted from @nuhokai/world at build time.",
      why: "Same owner, same trigger (CLI version), same refresh policy. Editors already run TS; the gap is resolution and strict options, and a test comparing the embedded .d.ts with the package keeps it from drifting.",
      rejected: [
        { option: "node_modules write", why: "Imposes a node_modules shape." },
        { option: "hand-written .d.ts", why: "Drifts from the runtime and misses brand errors." },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
