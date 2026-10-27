import { node } from "@nuhokai/world";

/** The default node file: its bytes, and its exclusive creation. */
export const NodeFile = node({
  id: "01a17950-b221-7124-8356-08fd2fee0888",
  purpose:
    "Own the default node file: one planned leaf's bytes, created exclusively at the given path with missing parent directories; never overwrites or chooses a path.",
  status: "building",
  source: ["packages/cli/src/new/node-file.ts"],
  ports: {
    create: {
      kind: "call",
      purpose: "Create the node file",
      input: "path, export name, id",
      output: "path written",
      errors: ["file already exists", "parent directory cannot be created", "directory not writable", "write failed"],
    },
  },
  requirements: [
    { id: "R1", text: "Creates exactly the given path and its missing parent directories, nothing else." },
    {
      id: "R2",
      text: "Imports only node from @nuhokai/world; exports the given name with the given id, status planned, source [] and one run call port; purpose, input and output start with TODO:.",
    },
    {
      id: "R3",
      text: "Deterministic: same name and id → identical bytes; LF endings, one trailing newline, no timestamp or path.",
    },
    {
      id: "R4",
      text: "Never overwrites: an existing file or directory at the path → one operational error, left as it was.",
    },
    {
      id: "R5",
      text: "A failed write removes any partial file; a failing removal does not replace the original error.",
    },
    {
      id: "R6",
      text: "Name not a PascalCase identifier, or id not a uuid: caller bug → TypeError; no bytes, file or directory.",
    },
  ],
  testCases: [
    {
      text: "New path with missing parents → the templated bytes, loading as one planned leaf.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "Same name and id → identical bytes; a different id changes only the id line.",
      demonstrates: ["R3"],
    },
    {
      text: "Existing file or directory at the path → one error, first bytes kept; failed write → no partial file.",
      demonstrates: ["R4", "R5"],
    },
    {
      text: "Name with a hyphen, space or quote, or a non-uuid id → TypeError; no file or directory left.",
      demonstrates: ["R6"],
    },
  ],
}).edges({});
