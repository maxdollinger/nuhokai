import { ok, orFailed, type Report } from "../shared/report.ts";
import { render } from "./prompt-text.ts";
import { scopeAt } from "./review-scope.ts";

/**
 * The program behind `review <node>`: load, find the node, its scope, render, report (R1). Answers the review prompt
 * for the node at hierarchy path `node` in the project directory `root`, named from the cwd: ok with the prompt's
 * lines; failed with one line for no world or a load failure; invalid with one line for no such node or one that is
 * not reviewable (R2). Programming errors propagate and crash with their stack.
 */
export function runReviewPrompt(root: string, node: string): Promise<Report> {
  return orFailed(async () => ok(render(root, await scopeAt(root, node))));
}
