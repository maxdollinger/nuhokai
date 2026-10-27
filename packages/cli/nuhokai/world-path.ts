import { node } from "@nuhokai/world";

/** The world's folder layout, and the one name of a path inside it. Pure. */
export const WorldPath = node({
  id: "01a17950-b221-7125-9a41-6c8f2d70be19",
  purpose:
    "Own the world's layout (nuhokai/: index.ts, node files, CLI-owned files, map) and the one cwd-relative, " +
    "/-separated name of a path in it, which opens as printed. Pure: no I/O.",
  status: "built",
  source: ["packages/cli/src/shared/paths.ts"],
  ports: {
    file: {
      kind: "call",
      purpose: "Name a file in the world, cwd-relative",
      input: "project directory (cwd-relative), segments inside nuhokai/",
      output: "<project directory>/nuhokai/<segments>, / separators; nuhokai/<segments> for the cwd",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "nuhokai/ holds index.ts, tsconfig.json, .generated/world/index.d.ts and .generated/map.html, names given here; the CLI owns no other path.",
    },
    {
      id: "R2",
      text: "Name = project directory + nuhokai/ + segments, / separators on every platform; the cwd (.) adds no ./ prefix.",
    },
    {
      id: "R3",
      text: "Segments appended as given: no validation, normalization, extension or renaming. Which paths a command may create is that command's rule.",
    },
    {
      id: "R4",
      text: "The name is both the path read or written and the one printed on stdout/stderr: packages/cli/nuhokai/... under --path packages/cli, nuhokai/... in the cwd.",
    },
    { id: "C1", kind: "constraint", text: "No filesystem access: no existence check, read, write or mkdir." },
  ],
  testCases: [
    {
      text: "file('packages/cli', 'new', 'stock-order.ts') → packages/cli/nuhokai/new/stock-order.ts on every platform; index.ts, tsconfig.json, .generated/world/index.d.ts, .generated/map.html come from these names.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "file('.', '.generated/map.html') → nuhokai/.generated/map.html; file('.') → nuhokai, never ./nuhokai; absolute directory → absolute name.",
      demonstrates: ["R2", "R4"],
    },
    {
      text: "Segment with dots, uppercase or a leading dash passes unchanged; no call creates, reads or stats anything.",
      demonstrates: ["R3", "C1"],
    },
  ],
  decisions: [
    {
      decision: "One node owns the world's layout and the one name of a path, shared by all commands.",
      why: "Two spellings of nuhokai/ drift; printed paths must match across commands and platforms so tests, docs and scripts can compare them.",
      rejected: [
        {
          option: "Each command spells nuhokai/ and joins its own paths",
          why: "Two constants to sync; printed form drifts.",
        },
        {
          option: "Absolute form for the filesystem plus a printed form joined under a prefix per command",
          why: "Two forms and a join per print site; the cwd-relative name opens as printed and serves both.",
        },
        {
          option: "Absolute paths on stdout",
          why: "Differ per machine; output stops being comparable.",
        },
      ],
    },
  ],
}).edges({});
