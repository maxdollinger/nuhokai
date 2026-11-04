import { node } from "@nuhokai/world";
import { FileSystem } from "./external.ts";
import { Path } from "./path/path.ts";

/** The files that exist in the project directory. */
export const ProjectFiles = node({
  id: "01a1a638-312c-75bd-9a7e-dcd59fbe6cec",
  purpose:
    "Answer which files exist in the project directory: below a directory, or at a path. The one walk of the " +
    "project's files; knows nothing of nodes or globs.",
  status: "planned",
  source: [],
  ports: {
    list: {
      kind: "call",
      purpose: "The files below a directory, at any depth",
      input: "project directory (cwd-relative), a /-separated directory relative to it, '' for itself",
      output: "/-separated paths relative to the project directory, sorted by code unit; none for a missing directory",
      errors: ["errno failure other than a missing entry"],
    },
    isFile: {
      kind: "call",
      purpose: "Whether a file exists at a path",
      input: "project directory (cwd-relative), a /-separated path relative to it",
      output: "whether a file is there, inside the project directory",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "A symlink is followed only while its target stays inside the project directory; one leading out counts as nothing there, and a symlink cycle never hangs.",
    },
    { id: "R2", text: "Each directory is read at most once per instance, however many entries ask below it." },
    { id: "C1", kind: "constraint", text: "Reads only; never writes, prints or matches a pattern." },
  ],
  testCases: [
    {
      text: "src/a.ts, src/b/c.ts and a symlink src/out → /tmp → list src gives src/a.ts, src/b/c.ts; isFile src/out/x → false; a symlink to its own parent → list returns.",
      demonstrates: ["R1"],
    },
    {
      text: "list src twice and list src/b once → src read once.",
      demonstrates: ["R2"],
    },
  ],
}).edges({ uses: () => [FileSystem.read, Path.isInside] });
