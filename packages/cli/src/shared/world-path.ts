import { isAbsolute, join, sep } from "node:path";

/** The one folder init writes, and every path inside it. */
export const WORLD_DIR = "nuhokai";
export const WORLD_INDEX = "index.ts";
export const WORLD_EXAMPLE = "example.ts";
export const WORLD_TSCONFIG = "tsconfig.json";
/** Everything the CLI regenerates lives under this folder; nothing in it is a world file. */
export const WORLD_GENERATED_DIR = ".generated";
export const WORLD_TYPES_PATH = `${WORLD_GENERATED_DIR}/world/index.d.ts`;
export const WORLD_MAP = `${WORLD_GENERATED_DIR}/map.html`;

/**
 * A path in the world folder of the project directory `root`, named as `root` names
 * it and `/`-separated: `nuhokai/…` when `root` is `.`, else `<root>/nuhokai/…`.
 * Opens as printed, from the cwd that named `root`.
 */
export function nameInWorld(root: string, ...parts: string[]): string {
  return join(root, WORLD_DIR, ...parts)
    .split(sep)
    .join("/");
}

/**
 * A path in the project directory `root`, such as a node's source entry, named as `root` names it and
 * `/`-separated: the path itself when `root` is `.`, else `<root>/<path>`. Glob characters pass unchanged, so
 * `src/**` under `packages/cli` is `packages/cli/src/**`; an absolute path stays as it is. Opens as printed,
 * from the cwd that named `root`.
 */
export function nameInProject(root: string, path: string): string {
  return (isAbsolute(path) ? path : join(root, path)).split(sep).join("/");
}

/**
 * The one order of the names commands print, and of what findings sort by: plain code-unit order, so the same names
 * sort byte-identically on every machine and locale.
 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whether the real path `path` is the real directory `dir` or lies inside it: how a symlink is held to a boundary. */
export function isInside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith(sep) ? dir : `${dir}${sep}`);
}

/** A word as a shell reads it back: unchanged when plain, else single-quoted. */
function shellWord(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

/**
 * A command a message suggests, in backticks, every word shell-quoted so it runs as printed: `nuhokai <name> <args>`,
 * plus `--path <root>` unless `root` is the cwd.
 */
export function suggestedCommand(name: string, args: readonly string[], root: string): string {
  return `\`${["nuhokai", name, ...args, ...(root === "." ? [] : ["--path", root])].map(shellWord).join(" ")}\``;
}
