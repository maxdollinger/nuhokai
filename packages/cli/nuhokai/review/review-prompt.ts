import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { PromptText } from "./prompt-text.ts";
import { ReviewScope } from "./review-scope.ts";

/** The program behind `review <node>`. */
export const ReviewPrompt = node({
  id: "01a1a638-318d-7110-a697-dc13cc8070fc",
  purpose: "The program behind `review <node>`: order and outcome only; never prints.",
  status: "building",
  source: ["src/review/review-prompt.ts", "src/review/review-prompt.test.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Return a Report holding the review prompt for one node",
      input: "project directory (cwd-relative), hierarchy path",
      output:
        "Report: ok with the prompt's lines; failed (no world, a load failure) or invalid (no such node, not reviewable) with one failure line",
      errors: [
        "no world at nuhokai/",
        "world failed to load",
        "no node at the path: names the closest match",
        "the node is not reviewable: says why",
      ],
    },
  },
  requirements: [
    { id: "R1", text: "Order: load, find the node and its scope (ReviewScope.scopeAt), render, report." },
    {
      id: "R2",
      text: "No world or a load failure → failed. No such node or one not reviewable → ReviewScope.scopeAt's InvalidArgument, reported invalid (exit 2) by Failure's report.",
    },
  ],
  testCases: [
    {
      text: "`review Tree/PrintTree` → the prompt, ok; `review Tree/PrintTre` → did you mean `nuhokai review Tree/PrintTree`?, invalid; `review Check` → not reviewable, invalid; no world → one failure line, failed.",
      demonstrates: ["R1", "R2"],
    },
  ],
}).edges({ uses: () => [ReviewScope.scopeAt, PromptText.render, Failure.report] });
