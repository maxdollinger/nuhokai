import { node } from "@nuhokai/world";
import { Path } from "../path/path.ts";
import { ProjectFiles } from "../project-files.ts";
import { SpecItems } from "./spec-items.ts";

/** What a review of one node covers. Both programs derive it, so prompt and validation agree. */
export const ReviewScope = node({
  id: "01a1a638-3166-7422-9654-ca4cda8f7160",
  purpose:
    "Decide what a review of one node covers: its spec items, its files and what it may use, or why it is not " +
    "reviewable. The one source of both the prompt and the validation.",
  status: "building",
  source: ["src/review/review-scope.ts", "src/review/review-scope.test.ts"],
  ports: {
    scope: {
      kind: "call",
      purpose: "The review's scope",
      input: "project directory (cwd-relative), the loaded world, a node's position",
      output:
        "{ node: path, specFile, items: SpecItems.list, files: cwd-relative, uses: { path, ports, source, purpose, external }[], drafts: tbd descriptions }",
      errors: [
        "a dome: names `nuhokai tree <path>` to list its children",
        "no source: external, abstract or not built yet",
        "its source matches no file: names `nuhokai check`",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Reviewable (Review R2) or one CliError saying why; an invalid argument, as a node path naming no node is.",
    },
    {
      id: "R2",
      text: "files: each entry's files, as SourceRules R1 finds them (ProjectFiles, Path), each once, sorted, named cwd-relative (Path.nameInProject) so they open as printed.",
    },
    {
      id: "R3",
      text: "uses: each uses target from LoadWorld's positions with its path, the ports used, its source entries as written (not expanded) and its purpose; an external says so, as the agent knows it by name and purpose alone.",
    },
    {
      id: "R4",
      text: "drafts: the description of each tbd placeholder the node uses: a dependency not designed yet, never reviewed against.",
    },
    { id: "R5", text: "Same world, files and node → the same scope." },
  ],
  testCases: [
    {
      text: "PrintTree → files src/tree/print-tree.ts and its test; uses LoadWorld, Path, TreeLines and Failure with their ports; no drafts. LoadWorld → every file under src/load/, sorted.",
      demonstrates: ["R2", "R3"],
    },
    {
      text: "Check → a dome, naming `nuhokai tree Check`; Terminal → no source; a leaf whose only entry matches nothing → naming `nuhokai check`.",
      demonstrates: ["R1"],
    },
    {
      text: "The init example node with its tbd port → one draft with its description; its uses list leaves it out.",
      demonstrates: ["R4"],
    },
  ],
}).edges({
  uses: () => [
    SpecItems.list,
    ProjectFiles.list,
    ProjectFiles.isFile,
    Path.isGlob,
    Path.staticPrefix,
    Path.matches,
    Path.nameInProject,
    Path.suggestedCommand,
  ],
});
