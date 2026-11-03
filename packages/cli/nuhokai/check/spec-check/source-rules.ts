import { node } from "@nuhokai/world";
import { BunRuntime, FileSystem } from "../../external.ts";
import { Path } from "../../path/path.ts";
import { Diagnostics } from "../diagnostics.ts";

/** The rules that read the filesystem: R6, R7, R10. */
export const SourceRules = node({
  id: "01a188c9-4a10-737f-97f6-8dfc24bc08b6",
  purpose:
    "Hold every source entry against the project's files: each exists, lies under the world's source, and each file has one owner.",
  status: "built",
  source: ["src/check/spec-check/source-rules.ts"],
  requirements: [
    {
      id: "R1",
      text: "A plain path is checked directly. A glob is expanded only below its static prefix (src/map/** → src/map/), each directory read at most once; R6, R7 and R10 share the expansions.",
    },
    {
      id: "R2",
      text: "One matcher for every pattern: Bun's glob syntax on /-separated paths relative to the project directory, never following a symlink out of it.",
    },
    {
      id: "R3",
      text: "A missing source, or an entry that is no string, is an error at its node or the world file, never a crash.",
    },
    {
      id: "R4",
      text: "A finding about one entry points at that entry, and one about a source that is no list at its source property, when written in the owner's file; an entry spread in from another file points at that `...spread`, else at its owner's node() or defineWorld call.",
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
  uses: () => [
    Path.isInside,
    Path.isAncestor,
    Diagnostics.locate,
    Diagnostics.order,
    FileSystem.read,
    BunRuntime.matchGlob,
  ],
});
