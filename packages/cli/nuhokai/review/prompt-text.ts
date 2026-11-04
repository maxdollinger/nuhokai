import { node } from "@nuhokai/world";
import { Path } from "../path/path.ts";

/** The review prompt's text. Pure. */
export const PromptText = node({
  id: "01a1a638-3179-7684-ab5c-2e76eb035aea",
  purpose:
    "Own the prompt's wording: turn a review's scope into the instructions a coding agent follows, ending with " +
    "the command that submits its findings. Pure: never loads or prints.",
  status: "planned",
  source: [],
  ports: {
    render: {
      kind: "call",
      purpose: "Write the prompt",
      input: "project directory (cwd-relative), the scope as ReviewScope gives it",
      output: "the prompt's lines",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "In order: run `nuhokai check` first and stop if it fails; the node and its spec file; every spec item with its reference and file:line; the files to read; the allowed dependencies; the drafts; the categories and their verdicts; the JSON to answer with; the submit command.",
    },
    {
      id: "R2",
      text: "Drafts are named as drafts that may still change: neither code using them nor their absence is a finding.",
    },
    {
      id: "R3",
      text: "The submit command is spelled by Path.suggestedCommand (`nuhokai review --submit`, with --path when needed), so it runs as printed.",
    },
    {
      id: "R4",
      text: "Text from world files on one line each, control characters as one space (TreeLines R3): nothing in a spec reaches the terminal as a control code.",
    },
    { id: "R5", text: "Same scope and directory → the same lines." },
    { id: "C1", kind: "constraint", text: "No filesystem access, load or printing." },
  ],
  testCases: [
    {
      text: "PrintTree's scope → check first, then requirements[R1] with nuhokai/tree/print-tree.ts:<line>, the two files, LoadWorld.load among the dependencies, the JSON shape, `nuhokai review --submit` last; under --path packages/cli the command carries it.",
      demonstrates: ["R1", "R3"],
    },
    {
      text: "A scope with a draft → it is listed with its description and marked not to review against.",
      demonstrates: ["R2"],
    },
    {
      text: "A purpose holding ESC and a newline → one line with spaces; rendering twice → identical lines.",
      demonstrates: ["R4", "R5"],
    },
  ],
  decisions: [
    {
      decision: "The wording is a node of its own.",
      why: "It changes most while evals tune it (false errors, missed violations); the scope and the validation stay put.",
    },
  ],
}).edges({ uses: () => [Path.suggestedCommand] });
