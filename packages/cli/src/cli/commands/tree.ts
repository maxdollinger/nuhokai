/** `nuhokai tree [node] [-L <n>]`: at most one hierarchy path and the level; runs Tree. */
import { cmd, leftovers, type Option, splitOption } from "../cmd.ts";

export const DEFAULT_LEVEL = 1;

/** tree's own option: how many levels below the start to print; 0 = all. */
export const LEVEL_OPTION: Option = {
  names: ["--level", "-L"],
  value: "<n>",
  needs: "a whole number",
  text: `levels below the start to print; 0 = all (default: ${DEFAULT_LEVEL})`,
};

/** What Tree.run gets beside the directory: the hierarchy path to start from or none, and the level as a number. */
export interface TreeArgs {
  readonly node: string | undefined;
  readonly level: number;
}

export const treeCmd = cmd<TreeArgs>({
  description: "Print the node hierarchy, one line per node: path | source | purpose",
  synopsis: "nuhokai tree [node] [-L <n>]",
  options: [LEVEL_OPTION],
  parse(args) {
    const split = splitOption(args, LEVEL_OPTION);
    if ("error" in split) return split;
    const extra = leftovers(split.rest, 1);
    if (extra) return extra;
    const level = split.value;
    if (level !== undefined && !/^\d+$/.test(level.raw)) {
      return { error: `${level.spelling} needs ${LEVEL_OPTION.needs}, got '${level.raw}'` };
    }
    // The node passes unchanged: which node it names is Tree's to judge.
    return { node: split.rest[0], level: level === undefined ? DEFAULT_LEVEL : Number(level.raw) };
  },
  async exec(root, { node, level }) {
    const { runTree } = await import("../../tree/index.ts");
    return runTree(root, node, level);
  },
});
