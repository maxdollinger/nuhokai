import { node } from "@nuhokai/world";
import { FileSystem } from "./external.ts";
import { Path } from "./path/path.ts";

/** The files that exist in the project directory, and which a source entry names. */
export const ProjectFiles = node({
  id: "01a1a638-312c-75bd-9a7e-dcd59fbe6cec",
  purpose:
    "Answer which files exist in the project directory: below a directory, at a path, or named by a source entry. " +
    "The one walk of the project's files and the one expansion of an entry, so check and review agree on a node's " +
    "files; knows nothing of nodes.",
  status: "building",
  source: ["src/shared/project-files.ts", "src/shared/project-files.test.ts"],
  ports: {
    list: {
      kind: "call",
      purpose: "The files below a directory, at any depth",
      input: "project directory (cwd-relative), a /-separated directory relative to it, '' for itself",
      output:
        "{ files: /-separated paths relative to the project directory, sorted by code unit; none for a missing directory, unreadable: { dir, code }[] }",
      errors: [],
    },
    isFile: {
      kind: "call",
      purpose: "Whether a file exists at a path",
      input: "project directory (cwd-relative), a /-separated path relative to it",
      output: "whether a file is there, inside the project directory",
      errors: [],
    },
    realPath: {
      kind: "call",
      purpose: "The file behind a path, whatever name reaches it",
      input: "project directory (cwd-relative), a /-separated path relative to it",
      output: "the file's real path, through symlinks that stay inside; undefined when no file is there",
      errors: [],
    },
    expand: {
      kind: "call",
      purpose: "A source entry's files",
      input: "project directory (cwd-relative), a source entry as written",
      output:
        "{ files, unreadable } as list gives them; or refused: outside (absolute, or a leading ..) or climbs (a .. inside)",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "A symlink is followed only while its target stays inside the project directory; one leading out counts as nothing there. A listing walks breadth-first in code-unit order and each real directory once, at the first path it reaches it by: a symlink to a directory the walk already reached adds nothing, so a cycle or a mesh of links never hangs or multiplies.",
    },
    {
      id: "R2",
      text: "Each real directory is read at most once per instance, however many listings reach it; a listing is cached whole, so the same question gets the same answer whatever was asked before.",
    },
    {
      id: "R3",
      text: "A directory that cannot be read (an errno other than a missing entry, a path through a file or a symlink loop) is listed as unreadable with its errno code, never thrown; the files elsewhere are still listed.",
    },
    {
      id: "R4",
      text: "An entry's files: a plain path if a file is there; a glob, the files below its static prefix that it matches (Path), with the directories that walk could not read. A leading ./ is dropped; nothing else is normalized: an absolute entry or a leading .. is refused as outside, a .. segment inside as climbing back, and a refused entry matches nothing.",
    },
    {
      id: "R5",
      text: "realPath names the file behind a path, so two names of one file through a symlink compare equal; it answers as isFile does: nothing for a missing file, a directory or a link leading out.",
    },
    { id: "C1", kind: "constraint", text: "Reads only; never writes or prints." },
  ],
  testCases: [
    {
      text: "src/a.ts, src/b/c.ts and a symlink src/out → /tmp → list src gives src/a.ts, src/b/c.ts; isFile src/out/x → false; a symlink to its own parent → list returns.",
      demonstrates: ["R1"],
    },
    {
      text: "lib/a.ts and a symlink src/lib → lib: list src gives src/lib/a.ts, list '' gives lib/a.ts alone; eight directories each linking to the other seven → each file once, well under a second.",
      demonstrates: ["R1"],
    },
    {
      text: "list src twice and list src/b once → src read once; a/l → ../b and b/m → ../a: every listing after list('') equals a fresh instance's.",
      demonstrates: ["R2"],
    },
    {
      text: "src/secret unreadable (EACCES) → list src gives src/a.ts and unreadable src/secret EACCES.",
      demonstrates: ["R3"],
    },
    {
      text: "src/a.ts and ./src/a.ts → [src/a.ts]; src/**/*.ts → every .ts below src; src/../src/a.ts → climbs; ../x and an absolute path → outside.",
      demonstrates: ["R4"],
    },
    {
      text: "lib/a.ts and a symlink src/lib → lib: realPath of src/lib/a.ts equals realPath of lib/a.ts; of src/lib and src/gone.ts → undefined.",
      demonstrates: ["R5"],
    },
  ],
  decisions: [
    {
      decision: "Expanding a source entry is ProjectFiles' port, used by SourceRules and ReviewScope alike.",
      why: "Check and review must agree on a node's files, refused entries included; one expansion cannot drift, and Path stays pure.",
      rejected: [
        {
          option: "Each caller expands with Path and ProjectFiles.list",
          why: "Two copies drifted: review did not refuse .. or absolute entries that check refuses.",
        },
      ],
    },
    {
      decision: "Each real directory once per listing, at its first path breadth-first; listings cached whole.",
      why: "A mesh of symlinks would otherwise list every path through it (seconds for eight directories), and caching a sub-walk made under its parent's state made answers depend on call order.",
      rejected: [
        {
          option: "Track only the directories on the current path, as cycle detection",
          why: "Stops cycles but not meshes: the number of paths grows factorially.",
        },
      ],
    },
  ],
}).edges({
  uses: () => [FileSystem.read, Path.isInside, Path.compareText, Path.isGlob, Path.staticPrefix, Path.matches],
});
