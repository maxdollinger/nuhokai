import { node } from "@nuhokai/world";

/** The default node file: its bytes, and its exclusive creation. */
export const NodeFile = node({
  id: "01a17950-b221-7124-8356-08fd2fee0888",
  purpose:
    "Own the default node file: the bytes of one planned leaf, written exclusively to the given path, creating its missing parent directories; never overwrites, never chooses a path.",
  status: "building",
  source: ["packages/cli/src/new/node-file.ts"],
  ports: {
    create: {
      kind: "call",
      purpose: "Create the node file",
      input: "a path, the export name and the id",
      output: "the path written",
      errors: [
        "the file already exists",
        "a parent directory cannot be created",
        "the directory is not writable",
        "the write failed",
      ],
    },
  },
  requirements: [
    { id: "R1", text: "Creates exactly the given path and its missing parent directories, nothing else." },
    {
      id: "R2",
      text: "The file imports only node from @nuhokai/world, exports the given name, carries the given id, status planned, source [] and one run call port; purpose, input and output start with TODO:.",
    },
    {
      id: "R3",
      text: "Deterministic: the same name and id give identical bytes; LF endings, one trailing newline, no timestamp or path in the bytes.",
    },
    {
      id: "R4",
      text: "Never overwrites: an existing file or directory at the path is one operational error and stays as it was.",
    },
    {
      id: "R5",
      text: "A failed write removes the partial file, if any; a failing removal does not replace the original error.",
    },
    {
      id: "R6",
      text: "A name that is not a PascalCase identifier, or an id that is not a uuid, is a caller bug: a TypeError, no bytes, no file and no directory.",
    },
  ],
  testCases: [
    {
      text: "A new path with missing parents writes the templated bytes, which load as one planned leaf.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "The same name and id give identical bytes; a different id changes only the id line.",
      demonstrates: ["R3"],
    },
    {
      text: "An existing file or directory at the path fails with one error and leaves the first bytes; a failed write leaves no partial file.",
      demonstrates: ["R4", "R5"],
    },
    {
      text: "A name with a hyphen, a space or a quote, and a non-uuid id, each throw a TypeError and leave no file and no directory behind.",
      demonstrates: ["R6"],
    },
  ],
}).edges({});
