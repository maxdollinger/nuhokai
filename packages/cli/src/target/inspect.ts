import { lstatSync } from "node:fs";
import { join } from "node:path";
import { WORLD_DIR } from "../shared/paths.ts";

/** What sits at `<root>/nuhokai`; init decides, this only observes. */
export type TargetState = { readonly kind: "absent" } | { readonly kind: "world" } | { readonly kind: "occupied" };

/** A directory is a world, whatever is inside it. A file or symlink is in the way. */
export function inspectTarget(root: string): TargetState {
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(join(root, WORLD_DIR));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "absent" };
    throw error;
  }
  return stats.isDirectory() ? { kind: "world" } : { kind: "occupied" };
}
