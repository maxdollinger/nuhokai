import { node } from "@nuhokai/world";

/** The world's folder layout, and the one name of a path inside it. Pure. */
export const WorldPath = node({
  id: "01a17950-b221-7125-9a41-6c8f2d70be19",
  purpose:
    "Own where a world lives and how its paths are named: one folder nuhokai/ holding index.ts, the node files, the " +
    "CLI-owned tsconfig.json, .generated/world/index.d.ts and the map .generated/map.html; and the one name of a file " +
    "inside it, under the project directory named from the cwd with / separators, so it opens as printed. Pure: reads " +
    "and writes nothing.",
  status: "building",
  source: ["packages/cli/src/shared/paths.ts"],
  ports: {
    file: {
      kind: "call",
      purpose: "Place a file in the world, named from the cwd",
      input: "the project directory named from the cwd, and the path segments inside the world's folder",
      output: "<project directory>/nuhokai/<segments> with / separators; nuhokai/<segments> when it is the cwd",
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
      text: "The name joins the project directory, nuhokai/ and the given segments with / separators on every platform; the cwd (.) adds no ./ prefix.",
    },
    {
      id: "R3",
      text: "Segments are appended as given: no validation, normalization, extension or renaming. Which paths a command may create is that command's rule.",
    },
    {
      id: "R4",
      text: "The name is both the path a command reads or writes and the one it prints on stdout or stderr: packages/cli/nuhokai/... under --path packages/cli, nuhokai/... in the cwd.",
    },
    { id: "C1", kind: "constraint", text: "No filesystem access: no existence check, no read, no write, no mkdir." },
  ],
  testCases: [
    {
      text: "file('packages/cli', 'new', 'stock-order.ts') is packages/cli/nuhokai/new/stock-order.ts on every platform; index.ts, tsconfig.json, .generated/world/index.d.ts and .generated/map.html come from this node's names.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "file('.', '.generated/map.html') is nuhokai/.generated/map.html and file('.') is nuhokai, never ./nuhokai; an absolute directory gives an absolute name.",
      demonstrates: ["R2", "R4"],
    },
    {
      text: "A segment with dots, uppercase or a leading dash passes through unchanged, and no call creates, reads or stats anything.",
      demonstrates: ["R3", "C1"],
    },
  ],
  decisions: [
    {
      decision: "One node owns the world's folder layout and the one name of a path, shared by every command.",
      why: "Two spellings of nuhokai/ drift apart, and printed paths must be identical across commands and platforms so tests, docs and scripts can compare them.",
      rejected: [
        {
          option: "Each command spells nuhokai/ and joins its own paths",
          why: "Two constants to keep in sync; the printed form drifts.",
        },
        {
          option: "An absolute form for the filesystem and a printed form joined under a prefix by each command",
          why: "Two forms and a join at every print site; the name from the cwd opens as printed and works for both.",
        },
        { option: "Absolute paths on stdout", why: "The root differs per machine, so output stops being comparable." },
      ],
    },
  ],
}).edges({});
