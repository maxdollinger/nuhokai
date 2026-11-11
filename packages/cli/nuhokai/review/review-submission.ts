import { node } from "@nuhokai/world";
import { Diagnostics } from "../diagnostics.ts";
import { FileSystem } from "../external.ts";
import { Failure } from "../failure.ts";
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
        "no world at nuhokai/, the world failed to load, or a cited file cannot be read",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Shape: { node: string, findings: { category, specItem?, file, line, evidence }[] }; other keys are ignored. category is against-spec, possibly-against-spec or unspecified; specItem required for the first two, absent for unspecified; line a whole number ≥ 1; evidence not blank.",
    },
    {
      id: "R2",
      text: "Order: parse, judge the shape, load, find node and its scope (ReviewScope.scopeAt), judge the content. Content: each specItem found by SpecItems.find; each file one of the scope's files or an item's spec file, and its line within that file, as printed. A file that is none names the first five it may cite and counts the rest, so the line stays readable for a node of many files.",
    },
    {
      id: "R3",
      text: "Any problem → invalid (exit 2), every problem one failure line saying what is wrong and what to send instead (an example reference: the scope's), all of them, no finding line. No such node or one not reviewable → ReviewScope.scopeAt's invalid Report. No world or a load failure → failed, one failure line.",
    },
    {
      id: "R4",
      text: "Valid → one finding per submitted finding: against-spec an error, the others warnings; node its path, rule the spec item or 'unspecified', fix the evidence; their lines as Diagnostics.format gives them (in its order, identical ones merged), then Diagnostics.summarize. ok without errors, else failed.",
    },
  ],
  testCases: [
    {
      text: "Source src/** over src/assets/Screen Shot.png holding 'one', a newline and 'two', no final newline → line 2 valid and printed as named, line 3 past its end, which has 2 lines.",
      demonstrates: ["R2", "R4"],
    },
    {
      text: "'{' → not JSON; a finding without evidence, or unspecified with a specItem → one line each naming the field, invalid, no summary; extra keys such as reviewedFiles or confidence → ignored, valid.",
      demonstrates: ["R1", "R3"],
    },
    {
      text: "PrintTree: specItem requirements[R9], line 999 of print-tree.ts → two failure lines, invalid.",
      demonstrates: ["R2", "R3"],
    },
    {
      text: "Example over src/a.ts … src/g.ts, citing elsewhere.ts → one line naming src/a.ts to src/e.ts and 3 more, invalid.",
      demonstrates: ["R2", "R3"],
    },
    {
      text: "PrintTree: against-spec at requirements[R2] and unspecified at print-tree.ts:12 → 'error: src/tree/print-tree.ts:…: Tree/PrintTree: requirements[R2]; <evidence>', a warning line, 'failed: 1 error, 1 warning'; a finding citing nuhokai/tree/print-tree.ts at R3's line → valid.",
      demonstrates: ["R2", "R4"],
    },
  ],
}).edges({
  uses: () => [
    ReviewScope.scopeAt,
    SpecItems.find,
    Diagnostics.format,
    Diagnostics.summarize,
    FileSystem.read,
    Failure.format,
    Failure.report,
  ],
});
