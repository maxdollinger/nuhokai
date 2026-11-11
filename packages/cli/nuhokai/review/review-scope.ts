import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { LoadWorld } from "../load-world.ts";
import { Path } from "../path/path.ts";
import { ProjectFiles } from "../project-files.ts";
import { SpecItems } from "./spec-items.ts";

/** What a review of one node covers. Both programs derive it, so prompt and validation agree. */
export const ReviewScope = node({
  id: "01a1a638-3166-7422-9654-ca4cda8f7160",
  purpose:
    "Decide what a review of one node covers: its spec items, its files and what it may use, or why it is not " +
    "reviewable. The one source of both the prompt and the validation, and their shared first steps.",
  status: "building",
  source: ["src/review/review-scope.ts", "src/review/review-scope.test.ts"],
  ports: {
    scopeAt: {
      kind: "call",
      purpose: "Both programs' first steps: load the world, find the node, its review's scope",
      input: "project directory (cwd-relative), hierarchy path",
      output:
        "{ node: path, specFile, items: SpecItems.list, example: a reference to cite in examples, files: cwd-relative, uses: SpecItems.targets, drafts: the tbd placeholders it uses }; or an invalid Report of one failure line",
      errors: [
        "no node at the path: names the closest match",
        "a dome: names `nuhokai tree <path>` to list its children",
        "no source (none, or one LoadWorld replaced): external, abstract or not built yet",
        "its source matches no file: names `nuhokai check`",
        "no world at nuhokai/, or the world failed to load: thrown",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Reviewable: a leaf whose source matches at least one file (externals, contracts and nodes not built have none). Else one CliError saying why: an invalid argument, as a node path naming no node is.",
    },
    {
      id: "R2",
      text: "files: each entry's files as check finds them (ProjectFiles.expand), named cwd-relative (Path.nameInProject) so they open as printed, then each once, sorted (Path.compareText).",
    },
    {
      id: "R3",
      text: "uses: the uses edges' targets as SpecItems.targets gives them.",
    },
    {
      id: "R4",
      text: "drafts: each tbd placeholder the node uses, as LoadWorld gives it: a dependency not designed yet, never reviewed against.",
    },
    { id: "R5", text: "Same world, files and node → the same scope." },
    {
      id: "R6",
      text: "Order: load (LoadWorld.load), find the node (Path.findNode), its scope; a CliError from either → the invalid Report of its message (exit 2); no world or a load failure is thrown, for the program to report as failed (exit 1).",
    },
    {
      id: "R7",
      text: "example: the first requirement's reference, else purpose: the one example the prompt's JSON and submit's messages cite.",
    },
  ],
  testCases: [
    {
      text: "PrintTree → files src/tree/print-tree.ts and its test; uses LoadWorld.load first; no drafts; example requirements[R1]. LoadWorld → every file under src/load/, sorted.",
      demonstrates: ["R2", "R3", "R7"],
    },
    {
      text: "Check → a dome, naming `nuhokai tree Check`; Terminal, or a source that is no list → no source; a leaf whose only entry matches nothing → naming `nuhokai check`; source ['src//a.ts', 'src/a.ts', './src/a.ts'] → src/a.ts once.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "The init example node with its tbd port → one draft with its description and name; its uses list leaves it out; example purpose. A uses edge to the orphan Lost → uses Lost without a node.",
      demonstrates: ["R3", "R4", "R5", "R7"],
    },
    {
      text: "review Tree/PrintTre → invalid, did you mean `nuhokai review Tree/PrintTree`; review Check → invalid, a dome; no world → thrown, failed.",
      demonstrates: ["R6"],
    },
  ],
}).edges({
  uses: () => [
    SpecItems.list,
    SpecItems.targets,
    LoadWorld.load,
    ProjectFiles.expand,
    Path.findNode,
    Path.compareText,
    Path.nameInProject,
    Path.suggestedCommand,
    Failure.format,
    Failure.report,
  ],
});
