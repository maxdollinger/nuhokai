/** `nuhokai init`: no argument; runs Init. */
import { cmd, noArguments } from "../cmd.ts";

export const initCmd = cmd<undefined>({
  description: "Write the world skeleton, the CLI-owned tsconfig and the @nuhokai/world types",
  synopsis: "nuhokai init",
  options: [],
  parse: noArguments,
  async exec(root) {
    const { runInit } = await import("../../init/index.ts");
    return runInit(root);
  },
});
