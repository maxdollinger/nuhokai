/** `nuhokai init`: no argument; runs Init. */
import { type Cmd, extraArgument } from "../cmd.ts";

export const initCmd: Cmd = {
  description: "Write the world skeleton, the CLI-owned tsconfig and the @nuhokai/world types",
  args: "",
  options: [],
  parse: (_values, positionals) =>
    extraArgument(positionals, 0) ?? {
      async run(root) {
        const { runInit } = await import("../../init/index.ts");
        return runInit(root);
      },
    },
};
