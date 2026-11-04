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
      id: "R2",
      text: "A node is reviewable when it has no children and its source matches at least one file. Externals, abstract and planned nodes have no source; domes are never reviewed.",
    },
    {
      id: "R3",
      text: "The code is held against the whole spec, inherited items included: requirements and constraints, ports (shapes, errors, transport), uses edges, test cases, decisions with their rejected options, and the purpose. The agent cites an item by its coarse reference (SpecItems R1): a port or a decision, never one of its fields.",
    },
    {
      id: "R4",
      text: "Verdicts: against-spec → error, possibly-against-spec and unspecified → warning, no findings → pass. Exit: 0 valid without errors, 1 valid with an error or when the world does not load, 2 an invalid submission or argument.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "No model client, credentials or provider config: the agent that runs the prompt is the reviewer.",
    },
  ],
  testCases: [
    {
      text: "In packages/cli, `review Tree/PrintTree` → the prompt naming print-tree.ts and its test, R1–R3, LoadWorld.load among the allowed dependencies, exit 0; `review Check` → not reviewable, a dome, exit 2; `review Terminal` → no source, exit 2.",
      demonstrates: ["R1", "R2", "R3"],
    },
    {
      text: "Submitting one against-spec and one unspecified finding → an error and a warning line, 'failed: 1 error, 1 warning', exit 1; no findings → 'ok: 0 errors, 0 warnings', exit 0; a finding citing requirements[R9] → exit 2; no world → one failure line, exit 1.",
      demonstrates: ["R1", "R4"],
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
      decision:
        "Port names are the functions' names (scope, scopeAt, list, targets, find, render); a program's run port is run<Program> in code (runReviewPrompt, runReviewSubmission), as every program's is (runTree, runCheck, runMap).",
      why: "A reader of the spec finds the code and the reverse; programs keep the convention the other commands follow, so each command's entry point is distinct in Cmd's imports.",
    },
    {
      decision: "World text in the prompt is data, fenced off from the instructions.",
      why: "A spec or code file may hold text that reads like an instruction; the agent must hold the code against it, not follow it, and the markers say where it starts and ends.",
    },
    {
      decision: "A dev-loop tool, not a CI gate.",
      why: "Nothing proves a review ran or that the code did not change between prompt and submit.",
    },
  ],
  children: [ReviewPrompt, ReviewSubmission, ReviewScope, SpecItems, PromptText],
  ports: { run: ReviewPrompt.run, submit: ReviewSubmission.run },
}).edges({});
