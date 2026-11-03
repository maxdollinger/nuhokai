/** `nuhokai tree [node] [-L <n>]`: at most one hierarchy path and the level; runs Tree. */
import type { Cmd, Option } from "../cmd.ts";

export const DEFAULT_LEVEL = 1;

/** tree's own option: how many levels below the start to print; 0 = all. */
export const LEVEL_OPTION: Option<number> = {
  names: ["--level", "-L"],
  value: "<n>",
  needs: "a whole number",
  text: `levels below the start to print; 0 = all (default: ${DEFAULT_LEVEL})`,
  parse: (raw) => (/^\d+$/.test(raw) ? Number(raw) : undefined),
};

export const treeCmd: Cmd = {
  description: "Print the node hierarchy, one line per node: path | source | purpose",
  positionals: ["[node]"],
  options: [LEVEL_OPTION],
  // The node passes unchanged: which node it names is Tree's to judge.
  async run(root, { positionals: [node], get }) {
    const { runTree } = await import("../../tree/index.ts");
    return runTree(root, node, get(LEVEL_OPTION) ?? DEFAULT_LEVEL);
  },
};
