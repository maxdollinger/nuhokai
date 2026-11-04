/** `nuhokai review [node] [--submit]`: one hierarchy path, or --submit with the review on stdin; runs Review. */
import type { Cmd } from "../cmd.ts";

export const reviewCmd: Cmd = {
  description:
    "Have your coding agent review a node's code against its spec: print its prompt, then --submit its findings",
  positionals: ["[node]"],
  arguments: [
    {
      name: "node",
      text: "the leaf to review, by its path as `nuhokai tree` prints it, e.g. Tree/PrintTree (`nuhokai tree <dome>` lists a dome's children); required unless --submit",
    },
  ],
  output:
    "with a node, the prompt for your coding agent, which reviews the node's files against every item of its spec and pipes its findings as JSON to `nuhokai review --submit` (e.g. `nuhokai review --submit < review.json`); with --submit, one line per finding, `<error|warning>: <file>:<line>: <node>: <spec item|unspecified>; <evidence>`, then the summary `<ok|failed>: <n> errors, <n> warnings`: exit 0 when the review passes (warnings allowed), 1 on an against-spec finding, 2 for an invalid submission, each problem one line on stderr and nothing on stdout",
  options: [],
  stdinFlag: {
    names: ["--submit"],
    flag: true,
    text: "validate the review JSON piped to stdin and print its findings, instead of printing a prompt",
  },
  // The node passes unchanged: which node it names, and whether it can be reviewed, is Review's to judge.
  async run(root, { positionals: [node], stdin }) {
    if (stdin !== undefined) {
      const { runReviewSubmission } = await import("../../review/review-submission.ts");
      return runReviewSubmission(root, stdin);
    }
    const { runReviewPrompt } = await import("../../review/review-prompt.ts");
    return runReviewPrompt(root, node ?? "");
  },
};
