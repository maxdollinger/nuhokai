import { node } from "@nuhokai/world";
import { PromptText } from "./prompt-text.ts";
import { ReviewPrompt } from "./review-prompt.ts";
import { ReviewScope } from "./review-scope.ts";
import { ReviewSubmission } from "./review-submission.ts";
import { SpecItems } from "./spec-items.ts";

/** `nuhokai review`. Inside: ReviewPrompt and ReviewSubmission (programs), ReviewScope, SpecItems, PromptText. */
export const Review = node({
  id: "01a1a638-313f-77ef-94ae-08e7398c0baf",
  purpose:
    "Let the user's coding agent review one leaf's code against its spec: hand it the prompt, then validate the " +
    "findings it submits. Calls no model and stores nothing; conformance only, no general bug review.",
  status: "building",
  source: ["src/review/**"],
  requirements: [
    {
      id: "R1",
      text: "Two steps: `review <node>` prints the prompt; `review --submit` validates the agent's findings from stdin and prints them as check prints findings. Neither keeps state: both derive the review from the world and the files (ReviewScope).",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "No model client, credentials or provider config: the agent that runs the prompt is the reviewer.",
    },
  ],
  testCases: [
    {
      text: "In packages/cli: `review Tree/PrintTree` → the prompt, exit 0; `review Check` → exit 2; piping no findings to `review --submit` → 'ok: 0 errors, 0 warnings', exit 0; an against-spec finding → its error line, exit 1.",
      demonstrates: ["R1"],
    },
  ],
  decisions: [
    {
      decision: "The user's coding agent runs the review; the CLI prints its prompt and validates its answer.",
      why: "Setup stays one binary: no model client, credentials or provider config; the agent already has the code open.",
      rejected: [
        {
          option: "--ai and NUHOKAI_LLM_* settings",
          why: "A model client and its config in a toolchain that reads specs.",
        },
        { option: "An MCP server", why: "Possible later as `nuhokai mcp` if agents struggle with the CLI." },
      ],
    },
    {
      decision: "Conformance only, against every item of the spec.",
      why: "The spec is what only nuhokai can give; findings cite a spec item submit can check, and an error keeps meaning 'against spec'.",
      rejected: [
        {
          option: "A general bug review beside it",
          why: "The agent can do one without nuhokai; uncited findings cannot be validated and dilute the errors.",
        },
      ],
    },
    {
      decision: "Leaves only; a dome's own files are the spec check's.",
      why: "A leaf owns every file its source matches (SpecCheck R7), so its review needs no ownership rule.",
    },
    {
      decision: "A dev-loop tool, not a CI gate.",
      why: "Nothing proves a review ran or that the code did not change between prompt and submit.",
    },
  ],
  children: [ReviewPrompt, ReviewSubmission, ReviewScope, SpecItems, PromptText],
  ports: { run: ReviewPrompt.run, submit: ReviewSubmission.run },
}).edges({});
