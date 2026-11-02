import { lstatSync, statSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "./failure.ts";
import { inWorld, WORLD_DIR } from "./paths.ts";

/**
 * No world to work on: nothing at `<root>/nuhokai`, or something that is no directory. A CliError like any expected
 * failure, typed apart so a caller can stop before work that would only fail again for the same reason.
 */
export class NoWorldError extends CliError {
  constructor(message: string) {
    super(message);
    this.name = "NoWorldError";
  }
}

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

/**
 * For the commands that need a world: throw a NoWorldError unless one sits at `<root>/nuhokai`, naming init when
 * there is none.
 * A symlink to a directory is a world to read and write in; only init, which creates, finds it occupied.
 */
export function requireWorld(root: string): void {
  const state = inspectTarget(root);
  if (state.kind === "absent") {
    throw new NoWorldError(
      root === "."
        ? `no ${WORLD_DIR}/ here; run \`nuhokai init\` to start a world here, or pass --path <project dir>`
        : `no ${WORLD_DIR}/ in ${root}; run \`nuhokai init --path ${root}\` to start a world there`,
    );
  }
  if (state.kind === "occupied" && !statSync(join(root, WORLD_DIR), { throwIfNoEntry: false })?.isDirectory()) {
    throw new NoWorldError(`${inWorld(root)} exists but is not a directory`);
  }
}
