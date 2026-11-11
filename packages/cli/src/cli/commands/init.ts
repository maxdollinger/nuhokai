/** `nuhokai init`: no argument; runs Init. */
import type { Cmd } from "../cmd.ts";

export const initCmd: Cmd = {
  description: "Write the world skeleton, the CLI-owned tsconfig and the @nuhokai/world types",
  arguments: [],
  output: "each file written, one path per line; `<dir>/nuhokai/ already exists; nothing to do` when there is one",
  options: [],
  async run(root) {
    const { runInit } = await import("../../init/scaffold.ts");
    return runInit(root);
  },
};
