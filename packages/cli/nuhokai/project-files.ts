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
      input: "a source entry as written, on a ProjectFiles made for one project directory (cwd-relative)",
      output:
        "/-separated paths relative to the project directory, sorted by code unit; undefined for an entry outside it",
      errors: [],
    },
    isDirectory: {
      kind: "call",
      purpose: "Whether a source entry names a directory, so check can say so instead of 'matches no file'",
      input: "a relative path as written",
      output: "true for a directory inside the project directory, false otherwise",
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
      text: "An entry is normalized (./src//a.ts is src/a.ts); absolute or starting with .. it is outside, else its files are: a plain path's if a file is there, a glob's the files below its segments before the first glob character (Bun's syntax: * ? [ ] { } ! \\) that it matches. A glob without ** or braces is read only as deep as its segments reach.",
    },
    {
      id: "R3",
      text: "A glob never walks into .git or node_modules, at any depth, nor matches below one it starts in: version control and installed packages are never a node's code. A plain path there still names its file. Dotfiles match like any other file.",
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
    {
      text: "a.md, src/b.md, src/deep/c.md, src/deep/deeper/d.md: *.md reads only the root, src/*/*.md stops at src/deep, src/**/*.md reads every level.",
      demonstrates: ["R2"],
    },
    {
      text: "a.ts, src/b.ts, .git/hooks/c.ts, node_modules/pkg/d.ts, src/node_modules/e.ts, .hidden/f.ts: **/*.ts → .hidden/f.ts, a.ts, src/b.ts; node_modules/** → none; node_modules/pkg/d.ts → itself.",
      demonstrates: ["R3"],
    },
  ],
  decisions: [
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
