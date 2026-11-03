/** `nuhokai tree [node] [-L <n>]`: at most one hierarchy path and the level; runs Tree. */
import { type Cmd, extraArgument, type Option } from "../cmd.ts";

export const DEFAULT_LEVEL = 1;

/** tree's own option: how many levels below the start to print; 0 = all. */
export const LEVEL_OPTION: Option = {
  names: ["--level", "-L"],
  value: "<n>",
  needs: "a whole number",
  text: `levels below the start to print; 0 = all (default: ${DEFAULT_LEVEL})`,
};

export const treeCmd: Cmd = {
  description: "Print the node hierarchy, one line per node: path | source | purpose",
  args: "[node] [-L <n>]",
  options: [LEVEL_OPTION],
  parse(values, positionals) {
    const extra = extraArgument(positionals, 1);
    if (extra) return extra;
    const typed = values.get(LEVEL_OPTION);
    if (typed !== undefined && !/^\d+$/.test(typed.raw)) {
      return { error: `${typed.spelling} needs ${LEVEL_OPTION.needs}, got '${typed.raw}'` };
    }
    // The node passes unchanged: which node it names is Tree's to judge.
    const node = positionals[0];
    const level = typed === undefined ? DEFAULT_LEVEL : Number(typed.raw);
    return {
      async run(root) {
        const { runTree } = await import("../../tree/index.ts");
        return runTree(root, node, level);
      },
    };
  },
};
