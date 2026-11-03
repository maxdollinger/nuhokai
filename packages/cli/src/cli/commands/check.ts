/** `nuhokai check`: no argument; runs Check. */
import type { Cmd } from "../cmd.ts";

export const checkCmd: Cmd = {
  description: "Load the world, run tsc and the global rules, print one diagnostics list",
  positionals: [],
  options: [],
  async run(root) {
    // The checker's client is only check's to load.
    const { runCheck } = await import("../../check/index.ts");
    return runCheck(root);
  },
};
