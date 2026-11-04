import { node } from "@nuhokai/world";
import { Diagnostics } from "../../diagnostics.ts";
import { Failure } from "../../failure.ts";
import { Path } from "../../path/path.ts";
import { ProjectFiles } from "../../project-files.ts";

/** The rules that read the filesystem: R6, R7, R10. */
export const SourceRules = node({
  id: "01a188c9-4a10-737f-97f6-8dfc24bc08b6",
  purpose:
    "Hold every source entry against the project's files: each exists, lies under the world's source, and each file has one owner.",
  status: "building",
  source: ["src/check/spec-check/source-rules.ts"],
  requirements: [
    {
      id: "R1",
      text: "An entry's files are ProjectFiles.expand's: refused when absolute, leading or climbing back with .., else what it matches. One ProjectFiles per run, so R6, R7 and R10 share every directory read, and check and review agree on a node's files.",
    },
    {
      id: "R3",
      text: "A missing source, or an entry that is no string, is an error at its node or the world file, never a crash.",
    },
    {
      id: "R5",
      text: "A directory an entry's walk cannot read (ProjectFiles R3) is one error at that entry, naming the directory and its errno code, with the fix: make it readable or narrow the entry. Every other finding still counts, so one unreadable directory never hides the rest.",
    },
    {
      id: "R6",
      text: "Files compare by their real path (ProjectFiles.realPath), for R7 and R10 alike: a listing reaches each directory once, under the first name that gets there, so a file one source lists through a symlink is the same file another lists under its other name. A conflict over a file listed under two names names both.",
    },
    {
      id: "R4",
      text: "A finding about one entry points at that entry, and one about a source that is no list at its source property, when written in the owner's file; an entry spread in from another file points at that `...spread`, else at its owner's node() or defineWorld call.",
    },
  ],
  testCases: [
    {
      text: "World source ['**/*.ts'], lib/a.ts, a symlink src/lib → ../lib, a node claiming src/lib/*.ts → no finding; world src/**, a sibling link src/a → z, a node claiming src/z/** → no finding.",
      demonstrates: ["R6"],
    },
    {
      text: "Siblings claiming src/** and src/z/** with src/a → z → one error at the second naming src/z/f.ts, also listed as src/a/f.ts.",
      demonstrates: ["R6"],
    },
  ],
  ports: {
    check: {
      kind: "call",
      purpose: "Judge the source rules",
      input: "project directory, cwd-relative; the loaded world, as LoadWorld.load answers it",
      output: "findings as Diagnostics.format takes them",
    },
  },
}).edges({
  uses: () => [Path.isAncestor, ProjectFiles.expand, ProjectFiles.realPath, Diagnostics.locate, Failure.format],
});
