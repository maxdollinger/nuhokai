/** `nuhokai review [node] [--submit]`: one hierarchy path, or --submit with the review on stdin; runs Review. */
import type { Cmd, Flag } from "../cmd.ts";

/** review's second step: validate the review piped to stdin instead of printing a prompt. */
export const SUBMIT_FLAG: Flag = {
  names: ["--submit"],
  flag: true,
  text: "validate the review JSON piped to stdin and print its findings, instead of printing a prompt",
};

export const reviewCmd: Cmd = {
  description:
    "Have your coding agent review a node's code against its spec: print its prompt, then --submit its findings",
  positionals: ["[node]"],
  arguments: [
    {
      name: "node",
      text: "the leaf to review, by its path as tree prints it, e.g. Tree/PrintTree; required unless --submit",
    },
  ],
  output:
    "with a node, the prompt for the agent, ending with the command that submits its findings; with --submit, one line per finding, `<error|warning>: <file>:<line>: <node>: <spec item|unspecified>; <evidence>`, then the summary `<ok|failed>: <n> errors, <n> warnings`",
  options: [SUBMIT_FLAG],
  input: { flag: SUBMIT_FLAG, what: "the review JSON" },
  notes: [
    "Flow: `nuhokai review <node>` prints a prompt; hand it to your coding agent, which reviews the node's files against every item of its spec and pipes its findings as JSON to `nuhokai review --submit` (e.g. `nuhokai review --submit < review.json`). Submit validates them against the spec and prints them as check prints its findings; fix the code or the review and repeat until it exits 0.",
    "Find a node with `nuhokai tree` (`nuhokai tree <dome>` lists a dome's children): only a leaf whose source matches a file can be reviewed.",
    "Exit codes of review: 0 the prompt was printed, or the review passes (warnings allowed); 1 the review has an against-spec finding, or the world does not load; 2 a node path naming no node, a node that cannot be reviewed, a node beside --submit or neither, --submit from a terminal or with nothing piped in, or an invalid submission (each problem one line on stderr; nothing is printed on stdout).",
  ],
  misuse({ positionals: [node], has }) {
    const submit = has(SUBMIT_FLAG);
    if (node !== undefined && submit) return `give a node or --submit, not both: '${node}' and --submit`;
    if (node === undefined && !submit) return "give the node to review, or --submit with the review piped to stdin";
    return undefined;
  },
  // The node passes unchanged: which node it names, and whether it can be reviewed, is Review's to judge.
  async run(root, { positionals: [node], input }) {
    if (node === undefined) {
      const { runReviewSubmission } = await import("../../review/review-submission.ts");
      return runReviewSubmission(root, input ?? "");
    }
    const { runReviewPrompt } = await import("../../review/review-prompt.ts");
    return runReviewPrompt(root, node);
  },
};
