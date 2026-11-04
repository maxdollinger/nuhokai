import { node } from "@nuhokai/world";
import { Diagnostics } from "../diagnostics.ts";
import { FileSystem } from "../external.ts";
import { Failure } from "../failure.ts";
import { LoadWorld } from "../load-world.ts";
import { Path } from "../path/path.ts";
import { ReviewScope } from "./review-scope.ts";
import { SpecItems } from "./spec-items.ts";

/** The program behind `review --submit`. */
export const ReviewSubmission = node({
  id: "01a1a638-31a1-7367-870d-f1b08c2ed0e3",
  purpose:
    "The program behind `review --submit`: hold the agent's findings against the review's scope and print them " +
    "as check prints its findings; never prints itself.",
  status: "building",
  source: ["src/review/review-submission.ts", "src/review/review-submission.test.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Validate a submitted review and return its findings",
      input: "project directory (cwd-relative), the submission's text",
      output:
        "Report: ok or failed with one finding line each (Diagnostics.format) and the summary; invalid with one failure line per problem; failed with one failure line when no world loads",
      errors: [
        "not JSON, or not the review's shape: names the field",
        "no node at the path, or not reviewable",
        "a spec item, file or line the scope does not hold",
        "a file of the node missing from reviewedFiles",
        "no world at nuhokai/, or the world failed to load",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Shape: { node: string, reviewedFiles: string[], findings: { category, specItem?, file, line, evidence }[] }, no other keys. category is against-spec, possibly-against-spec or unspecified; specItem required for the first two, absent for unspecified; line a whole number ≥ 1; evidence not blank.",
    },
    {
      id: "R2",
      text: "Order: parse, judge the shape, load, find node, its scope, judge the content. Content: each specItem found by SpecItems.find; each file one of the scope's files or an item's spec file, and its line within that file; reviewedFiles holding every file of the scope (more are allowed), as printed.",
    },
    {
      id: "R3",
      text: "Any problem → invalid (exit 2), every problem one failure line saying what is wrong and what to send instead, all of them, no finding line. No world or a load failure → failed, one failure line.",
    },
    {
      id: "R4",
      text: "Valid → one finding per submitted finding: against-spec an error, the others warnings; node its path, rule the spec item or 'unspecified', fix the evidence; their lines as Diagnostics.format gives them (in its order, identical ones merged), then Diagnostics.summarize. ok without errors, else failed.",
    },
  ],
  testCases: [
    {
      text: "'{' → not JSON; a finding without evidence, or unspecified with a specItem → one line each naming the field, invalid, no summary.",
      demonstrates: ["R1", "R3"],
    },
    {
      text: "PrintTree: specItem requirements[R9], line 999 of print-tree.ts, reviewedFiles without the test file → three failure lines, invalid.",
      demonstrates: ["R2", "R3"],
    },
    {
      text: "PrintTree: against-spec at requirements[R2] and unspecified at print-tree.ts:12 → 'error: src/tree/print-tree.ts:…: Tree/PrintTree: requirements[R2]; <evidence>', a warning line, 'failed: 1 error, 1 warning'; a finding citing nuhokai/tree/print-tree.ts at R3's line → valid.",
      demonstrates: ["R2", "R4"],
    },
  ],
}).edges({
  uses: () => [
    LoadWorld.load,
    Path.findNode,
    ReviewScope.scope,
    SpecItems.find,
    Diagnostics.format,
    Diagnostics.summarize,
    FileSystem.read,
    Failure.report,
  ],
});
