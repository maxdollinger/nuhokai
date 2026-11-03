import { node } from "@nuhokai/world";

/** The world's folder layout, and the one name of a path inside it or the project. Pure. */
export const WorldPath = node({
  id: "01a17950-b221-7125-9a41-6c8f2d70be19",
  purpose:
    "Own the world's layout (nuhokai/: index.ts, node files, CLI-owned files, map) and the one cwd-relative, " +
    "/-separated name of a path in it or in the project directory, which opens as printed. Pure: no I/O. Also the spelling of a suggested command and the inside-test a symlink is held to.",
  status: "built",
  source: ["src/shared/paths.ts"],
  ports: {
    nameInWorld: {
      kind: "call",
      purpose: "Name a file in the world, cwd-relative",
      input: "project directory (cwd-relative), segments inside nuhokai/",
      output: "<project directory>/nuhokai/<segments>, / separators; nuhokai/<segments> for the cwd",
      errors: [],
    },
    nameInProject: {
      kind: "call",
      purpose: "Name a path in the project directory, cwd-relative",
      input: "project directory (cwd-relative), a /-separated path or glob relative to it, as a source entry is",
      output: "<project directory>/<path>, / separators; <path> unchanged for the cwd or an absolute path",
      errors: [],
    },
    suggestedCommand: {
      kind: "call",
      purpose: "Spell a command a message suggests, so it runs as printed",
      input: "command name, its arguments, project directory (cwd-relative)",
      output: "`nuhokai <name> <args> [--path <dir>]`, each word shell-quoted unless plain",
      errors: [],
    },
    isInside: {
      kind: "call",
      purpose: "Hold a real path to a directory boundary",
      input: "a real path, a real directory",
      output: "whether the path is the directory or lies below it",
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
      text: "Segments joined as given, . and .. resolved as a path join does: no validation, extension or renaming. Which paths a command may create is that command's rule.",
    },
    {
      id: "R4",
      text: "The name is both the path read or written and the one printed on stdout/stderr: packages/cli/nuhokai/... under --path packages/cli, nuhokai/... in the cwd.",
    },
    {
      id: "R5",
      text: "nameInProject: project directory + path as R2 joins it, without nuhokai/; a glob's characters (* ? [ ] { }) pass unchanged, so src/** under --path packages/cli is packages/cli/src/**; an absolute path stays as it is.",
    },
    { id: "C1", kind: "constraint", text: "No filesystem access: no existence check, read, write or mkdir." },
    {
      id: "R6",
      text: "suggestedCommand: --path <dir> only for another directory than the cwd; a word with anything but letters, digits and @%+=:,./- is single-quoted, so `a;touch x` or a space never splits or runs.",
    },
  ],
  testCases: [
    {
      text: "nameInWorld('packages/cli', 'stock', 'reserve.ts') → packages/cli/nuhokai/stock/reserve.ts on every platform; index.ts, tsconfig.json, .generated/world/index.d.ts, .generated/map.html come from these names.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "nameInWorld('.', '.generated/map.html') → nuhokai/.generated/map.html; nameInWorld('.') → nuhokai, never ./nuhokai; absolute directory → absolute name.",
      demonstrates: ["R2", "R4"],
    },
    {
      text: "Segment with dots, uppercase or a leading dash passes unchanged; no call creates, reads or stats anything.",
      demonstrates: ["R3", "C1"],
    },
    {
      text: "nameInProject('packages/cli', 'src/bin.ts') → packages/cli/src/bin.ts; nameInProject('.', 'src/**') → src/**, never ./src/**; nameInProject('packages/cli', '/etc/x') → /etc/x.",
      demonstrates: ["R5"],
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
