import { join, sep } from "node:path";

/** The one folder init writes, and every path inside it. */
export const WORLD_DIR = "nuhokai";
export const WORLD_INDEX = "index.ts";
export const WORLD_EXAMPLE = "example.ts";
export const WORLD_TSCONFIG = "tsconfig.json";
/** Everything the CLI regenerates lives under this folder; nothing in it is a world file. */
export const WORLD_GENERATED_DIR = ".generated";
export const WORLD_TYPES_DIR = `${WORLD_GENERATED_DIR}/world`;
export const WORLD_TYPES_FILE = "index.d.ts";
export const WORLD_MAP = `${WORLD_GENERATED_DIR}/map.html`;

/**
 * A path in the world folder of the project directory `root`, named as `root` names
 * it and `/`-separated: `nuhokai/…` when `root` is `.`, else `<root>/nuhokai/…`.
 * Opens as printed, from the cwd that named `root`.
 */
export function inWorld(root: string, ...parts: string[]): string {
  return join(root, WORLD_DIR, ...parts)
    .split(sep)
    .join("/");
}
