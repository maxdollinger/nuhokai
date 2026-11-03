/** `nuhokai update`: no argument; planned, so it answers that it is not built yet. */
import { failureLine } from "../../shared/report.ts";
import { type Cmd, extraArgument } from "../cmd.ts";

export const updateCmd: Cmd = {
  description: "Refresh the CLI-owned tsconfig and the @nuhokai/world types of an existing world",
  args: "",
  options: [],
  parse: (_values, positionals) =>
    extraArgument(positionals, 0) ?? {
      async run() {
        return { outcome: "failed", lines: [failureLine("not implemented yet")] };
      },
    },
};
