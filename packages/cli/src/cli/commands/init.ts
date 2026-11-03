/** `nuhokai init`: no argument; runs Init. */
import type { Cmd } from "../cmd.ts";

export const initCmd: Cmd = {
  description: "Write the world skeleton, the CLI-owned tsconfig and the @nuhokai/world types",
  positionals: [],
  options: [],
  async run(root) {
    const { runInit } = await import("../../init/index.ts");
    return runInit(root);
  },
};
