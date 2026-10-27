import { lstatSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "../shared/failure.ts";
import { inWorld, WORLD_DIR } from "../shared/paths.ts";

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

/** For the commands that need a world: throw unless one sits at `<root>/nuhokai`, naming init when there is none. */
export function requireWorld(root: string): void {
  const state = inspectTarget(root);
  if (state.kind === "absent") {
    throw new CliError(
      root === "."
        ? `no ${WORLD_DIR}/ here; run \`nuhokai init\` to start a world here, or pass --path <project dir>`
        : `no ${WORLD_DIR}/ in ${root}; run \`nuhokai init --path ${root}\` to start a world there`,
    );
  }
  if (state.kind === "occupied") throw new CliError(`${inWorld(root)} exists but is not a directory`);
}
