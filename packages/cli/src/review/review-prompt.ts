import { loadWorld } from "../load/load-world.ts";
import { CliError } from "../shared/failure.ts";
import { findNode } from "../shared/node-path.ts";
import { invalidFrom, ok, orFailed, type Report } from "../shared/report.ts";
import { renderPrompt } from "./prompt-text.ts";
import { reviewScope, type Scope } from "./review-scope.ts";

/**
 * The program behind `review <node>`: load, find the node, its scope, render, report (R1). Answers the review prompt
 * for the node at hierarchy path `node` in the project directory `root`, named from the cwd: ok with the prompt's
 * lines; failed with one line for no world or a load failure; invalid with one line for no such node or one that is
 * not reviewable (R2). Programming errors propagate and crash with their stack.
 */
export function runReviewPrompt(root: string, node: string): Promise<Report> {
  return orFailed(async () => {
    const world = await loadWorld(root);
    let scope: Scope;
    try {
      scope = reviewScope(root, world, findNode(world, node, root));
    } catch (error) {
      // A path naming no node, or a node that is not reviewable, is an invalid argument value: exit 2. A file that
      // cannot be read is a failure like a load failure.
      if (error instanceof CliError) return invalidFrom(error);
      throw error;
    }
    return ok(renderPrompt(root, scope));
  });
}
