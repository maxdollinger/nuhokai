import { node } from "@nuhokai/world";

/** The rules that read the filesystem: R6, R7. */
export const SourceRules = node({
  id: "01a188c9-4a10-737f-97f6-8dfc24bc08b6",
  purpose:
    "Hold every source entry against the project's files: each exists, lies under the world's source, and each file has one owner.",
  status: "planned",
  source: [],
  requirements: [
    {
      id: "R1",
      text: "A plain path is checked directly. A glob is expanded only below its static prefix (src/new/** → src/new/), each directory read at most once; R6, R7 and R10 share the expansions.",
    },
    {
      id: "R2",
      text: "One matcher for every pattern: Bun's glob syntax on /-separated paths relative to the project directory, never following a symlink out of it.",
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
}).edges({});
