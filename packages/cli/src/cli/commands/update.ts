/** `nuhokai update`: no argument; planned, so it answers that it is not built yet. */
import { failureLine } from "../../shared/report.ts";
import { cmd, noArguments } from "../cmd.ts";

export const updateCmd = cmd<undefined>({
  description: "Refresh the CLI-owned tsconfig and the @nuhokai/world types of an existing world",
  synopsis: "nuhokai update",
  options: [],
  parse: noArguments,
  async exec() {
    return { outcome: "failed", lines: [failureLine("not implemented yet")] };
  },
});
