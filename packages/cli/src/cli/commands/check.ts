/** `nuhokai check`: no argument; runs Check. */
import type { Cmd } from "../cmd.ts";

export const checkCmd: Cmd = {
  description: "Load the world, run tsc and the global rules, print one diagnostics list",
  positionals: [],
  arguments: [],
  output:
    "one line per finding, `<error|warning>: <file>:<line>: <node>: <rule>; <fix>` (a part it lacks is left out), then the summary `<ok|failed>: <n> errors, <n> warnings`",
  options: [],
  async run(root) {
    // The checker's client is only check's to load.
    const { runCheck } = await import("../../check/check-world.ts");
    return runCheck(root);
  },
};
