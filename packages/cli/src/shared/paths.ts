import { join } from "node:path";

/** The one folder init writes, and every path inside it, relative to the project root. */
export const WORLD_DIR = "nuhokai";
export const WORLD_INDEX = "index.ts";
export const WORLD_EXAMPLE = "example.ts";
export const WORLD_TSCONFIG = "tsconfig.json";
export const WORLD_TYPES_DIR = ".generated/world";
export const WORLD_TYPES_FILE = "index.d.ts";

/** An absolute path to a file in the world folder at `dir`. */
export function inWorld(dir: string, ...parts: string[]): string {
  return join(dir, WORLD_DIR, ...parts);
}

/** The same file, as init prints and tests expect it: relative to the project root, `/`-separated. */
export function fromRoot(...parts: string[]): string {
  return join(WORLD_DIR, ...parts)
    .split("\\")
    .join("/");
}

/** A file in the world, named both ways: absolute under the root, and from-root for stdout. */
export function worldFile(root: string, ...parts: string[]): { readonly absolute: string; readonly fromRoot: string } {
  return { absolute: inWorld(root, ...parts), fromRoot: fromRoot(...parts) };
}
