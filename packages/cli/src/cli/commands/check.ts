/** `nuhokai check`: no argument; runs Check. */
import { cmd, noArguments } from "../cmd.ts";

export const checkCmd = cmd<undefined>({
  description: "Load the world, run tsc and the global rules, print one diagnostics list",
  synopsis: "nuhokai check",
  options: [],
  parse: noArguments,
  async exec(root) {
    // The checker's client is only check's to load.
    const { runCheck } = await import("../../check/index.ts");
    return runCheck(root);
  },
});
