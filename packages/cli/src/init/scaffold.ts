import { CliError, oneLine } from "../shared/failure.ts";
import { fromRoot, WORLD_DIR } from "../shared/paths.ts";
import { inspectTarget } from "../target/inspect.ts";
import { type ResolveTargetEnvironment, resolveTarget } from "../target/resolve-target.ts";
import { publishWorld } from "./publish.ts";

/** What the run port may observe and answer; the defaults are the real process. */
export interface InitEnvironment extends ResolveTargetEnvironment {
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

/** The program's result, before it becomes lines and an exit code. */
export type ScaffoldOutcome =
  | { readonly kind: "written"; readonly paths: readonly string[] }
  | { readonly kind: "world" }
  | { readonly kind: "error"; readonly message: string };

/** Whether a failure is one init promises to explain on a single stderr line. */
function isOperational(error: unknown): boolean {
  if (error instanceof CliError) return true;
  // Filesystem failures carry a numeric errno; programming errors do not.
  return typeof (error as { errno?: unknown }).errno === "number";
}

/** Resolve, inspect, publish: the order is the program. Writes and prints nothing. */
export async function scaffold(cwd: string, environment: InitEnvironment = {}): Promise<ScaffoldOutcome> {
  try {
    const root = await resolveTarget(cwd, environment);
    const state = inspectTarget(root);

    if (state.kind === "world") return { kind: "world" };
    if (state.kind === "occupied") {
      throw new CliError(`${fromRoot(WORLD_DIR)} exists but is not a directory`);
    }

    return { kind: "written", paths: publishWorld(root) };
  } catch (error) {
    // Expected failures become one stderr line; a bug crashes with its stack.
    if (!isOperational(error)) throw error;
    return { kind: "error", message: oneLine(error) };
  }
}

/**
 * The init command: create the world at the target, or say why not. Prints the
 * three possible line sets here and resolves to the process exit code;
 * programming errors propagate and crash with their stack.
 */
export async function runInit(cwd: string, environment: InitEnvironment = {}): Promise<number> {
  const out = environment.out ?? ((line: string) => console.log(line));
  const err = environment.err ?? ((line: string) => console.error(line));

  const outcome = await scaffold(cwd, environment);
  switch (outcome.kind) {
    case "written":
      for (const path of outcome.paths) out(path);
      return 0;
    case "world":
      out(`${fromRoot(WORLD_DIR)} already exists; nothing to do`);
      return 0;
    case "error":
      err(`nuhokai init: ${outcome.message}`);
      return 1;
  }
}
