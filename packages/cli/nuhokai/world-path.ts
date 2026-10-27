import { node } from "@nuhokai/world";

/** The world's folder layout, and the two forms of a path inside it. Pure. */
export const WorldPath = node({
  id: "01a17950-b221-7125-9a41-6c8f2d70be19",
  purpose:
    "Own where a world lives and how its paths are named: one folder nuhokai/ holding index.ts, the node files, the " +
    "CLI-owned tsconfig.json, .generated/world/index.d.ts and the map .generated/map.html; and the two forms of a " +
    "file inside it, absolute under the root and from-root with / separators for stdout. Pure: reads and writes nothing.",
  status: "building",
  source: ["packages/cli/src/shared/paths.ts"],
  ports: {
    file: {
      kind: "call",
      purpose: "Place a file in the world and name it for stdout",
      input: "the project root and the path segments inside the world's folder",
      output: "the absolute path, and the same path from the project root with / separators",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "One folder, nuhokai/, holds index.ts, tsconfig.json, .generated/world/index.d.ts and .generated/map.html under the names given here; the CLI owns no other path.",
    },
    {
      id: "R2",
      text: "The absolute form joins the root, nuhokai/ and the given segments; the from-root form repeats them with / separators on every platform and never contains the root.",
    },
    {
      id: "R3",
      text: "Segments are appended as given: no validation, normalization, extension or renaming. Which paths a command may create is that command's rule.",
    },
    {
      id: "R4",
      text: "stdout shows a from-root path under the project directory as named from the cwd (packages/cli/nuhokai/...), unchanged when that is the cwd.",
    },
    { id: "C1", kind: "constraint", text: "No filesystem access: no existence check, no read, no write, no mkdir." },
  ],
  testCases: [
    {
      text: "file(root, 'new', 'stock-order.ts') gives <root>/nuhokai/new/stock-order.ts and nuhokai/new/stock-order.ts on every platform; index.ts, tsconfig.json, .generated/world/index.d.ts and .generated/map.html come from this node's names.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "A segment with dots, uppercase or a leading dash passes through unchanged, and no call creates, reads or stats anything.",
      demonstrates: ["R3", "C1"],
    },
    {
      text: "shown('packages/cli', 'nuhokai/.generated/map.html') is packages/cli/nuhokai/.generated/map.html; with an empty base the path is unchanged.",
      demonstrates: ["R4"],
    },
  ],
  decisions: [
    {
      decision: "One node owns the world's folder layout and both path forms, shared by every command.",
      why: "Two spellings of nuhokai/ drift apart, and stdout paths must be identical across commands and platforms so tests, docs and scripts can compare them.",
      rejected: [
        {
          option: "Each command spells nuhokai/ and joins its own paths",
          why: "Two constants to keep in sync; the printed form drifts.",
        },
        { option: "Absolute paths on stdout", why: "The root differs per machine, so output stops being comparable." },
      ],
    },
  ],
}).edges({});
