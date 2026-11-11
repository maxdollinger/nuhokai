import { lstatSync, statSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "./failure.ts";
import { nameInWorld, suggestedCommand, WORLD_DIR } from "./world-path.ts";

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
export type TargetState = "absent" | "world" | "occupied";

/** What every command says when something other than a directory sits at `<root>/nuhokai`. */
export function occupiedMessage(root: string): string {
  return `${nameInWorld(root)} exists but is not a directory`;
}

/** A directory is a world, whatever is inside it. A file or symlink is in the way. */
export function inspectTarget(root: string): TargetState {
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(join(root, WORLD_DIR));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
  return stats.isDirectory() ? "world" : "occupied";
}

/**
 * For the commands that need a world: throw a NoWorldError unless one sits at `<root>/nuhokai`, naming init when
 * there is none.
 * A symlink to a directory is a world to read and write in; only init, which creates, finds it occupied.
 */
export function requireWorld(root: string): void {
  const state = inspectTarget(root);
  if (state === "absent") {
    throw new NoWorldError(
      root === "."
        ? `no ${WORLD_DIR}/ here; run \`nuhokai init\` to start a world here, or pass --path <project dir>`
        : `no ${WORLD_DIR}/ in ${root}; run ${suggestedCommand("init", [], root)} to start a world there`,
    );
  }
  if (state === "occupied" && !statSync(join(root, WORLD_DIR), { throwIfNoEntry: false })?.isDirectory()) {
    throw new NoWorldError(occupiedMessage(root));
  }
}
