import { node } from "@nuhokai/world";
import { BunRuntime, FileSystem } from "./external.ts";
import { Path } from "./path/path.ts";

/** The files a source entry names in the project directory. */
export const ProjectFiles = node({
  id: "01a1a638-312c-75bd-9a7e-dcd59fbe6cec",
  purpose:
    "Answer which files a source entry names in the project directory: the one expansion of an entry, so check and " +
    "review agree on a node's files; knows nothing of nodes.",
  status: "building",
  source: ["src/shared/project-files.ts", "src/shared/project-files.test.ts"],
  ports: {
    expand: {
      kind: "call",
      purpose: "A source entry's files",
      input: "project directory (cwd-relative), a source entry as written",
      output:
        "/-separated paths relative to the project directory, sorted by code unit; undefined for an entry outside it",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Stays inside the project directory: a symlink to a file counts only while its target is inside; a symlink to a directory is never listed through, as git does, though a plain path through one names its file. A missing or unreadable directory holds no file. Each directory is read at most once per instance.",
    },
    {
      id: "R2",
      text: "An entry is normalized (./src//a.ts is src/a.ts); absolute or starting with .. it is outside, else its files are: a plain path's if a file is there, a glob's the files below its segments before the first glob character (Bun's syntax: * ? [ ] { } ! \\) that it matches.",
    },
    { id: "C1", kind: "constraint", text: "Reads only; never writes or prints." },
  ],
  testCases: [
    {
      text: "src/a.ts, a link src/b.ts → lib/b.ts, a link src/out.ts out of the project, a link src/lib → lib and src/loop → src: src/** gives src/a.ts and src/b.ts; src/lib/b.ts gives itself; src/lib/** nothing.",
      demonstrates: ["R1"],
    },
    {
      text: "src/a.ts, ./src/a.ts, src//a.ts and src/../src/a.ts → [src/a.ts]; src/**/*.ts → every .ts below src; src/b/ and '' → none; ../x and an absolute path → outside.",
      demonstrates: ["R2"],
    },
  ],
  decisions: [
    {
      decision: "Expanding a source entry is ProjectFiles' port, used by SourceRules and ReviewScope alike.",
      why: "Check and review must agree on a node's files; one expansion cannot drift.",
    },
    {
      decision: "A symlink to a directory is not listed through.",
      why: "No cycles, meshes or second names of one file to handle; a glob reaching code only through such a link matches no file, and check says so.",
      rejected: [
        {
          option: "Follow links inside the project, each real directory once",
          why: "A walk queue, real-path sets and real-path comparison for a layout specs rarely have.",
        },
      ],
    },
  ],
}).edges({
  uses: () => [FileSystem.read, BunRuntime.matchGlob, Path.isInside, Path.compareText],
});
