import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { WORLD_DIR } from "../shared/paths.ts";
import { writeCliFiles } from "./cli-files.ts";
import { writeExampleWorld } from "./example-world.ts";

/**
 * Make the complete world appear at the root or leave nothing behind: stage a
 * dot-prefixed directory inside the root, let the two content domains fill it,
 * then commit with one rename. Content belongs to the writers, not here.
 */
export function publishWorld(root: string): string[] {
  const staging = mkdtempSync(join(root, ".nuhokai-init-"));
  try {
    const authored = writeExampleWorld(staging);
    const owned = writeCliFiles(staging);
    renameSync(join(staging, WORLD_DIR), join(root, WORLD_DIR));
    return [...authored, ...owned.written];
  } finally {
    try {
      rmSync(staging, { recursive: true, force: true });
    } catch {
      // The commit already decided; a leftover staging name must not mask it.
    }
  }
}
