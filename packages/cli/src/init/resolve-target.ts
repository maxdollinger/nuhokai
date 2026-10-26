import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { InitError } from "./errors.ts";

/** What resolving the target may look at, so tests can stand in for git and the terminal. */
export interface ResolveTargetEnvironment {
  /** Whether a terminal can answer the one confirmation question. */
  readonly isTTY?: boolean;
  /** Asks one yes/no question; only called without Git and with a terminal. */
  readonly confirm?: (question: string) => Promise<boolean>;
  /** The Git work-tree root of a directory, or null when there is none. */
  readonly gitRoot?: (cwd: string) => string | null;
}

/**
 * The environment for the one git call: everything but Git's own variables.
 * GIT_DIR, GIT_WORK_TREE and friends can point git at a different repository,
 * and no env var may influence the root (ResolveTarget C1).
 */
function envWithoutGit(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.toUpperCase().startsWith("GIT_")) env[name] = value;
  }
  return env;
}

/** The work-tree root of `cwd`, or null without Git or outside a repository. */
export function findGitRoot(cwd: string): string | null {
  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync(["git", "-C", resolve(cwd), "rev-parse", "--show-toplevel"], {
      stdout: "pipe",
      stderr: "pipe",
      env: envWithoutGit(),
    });
  } catch {
    return null;
  }
  if (result.exitCode !== 0) return null;
  const root = result.stdout?.toString().trim() ?? "";
  return root ? resolve(root) : null;
}

/** Whether a terminal can answer the one confirmation question: an interactive stdin. */
export function hasTerminal(): boolean {
  return Boolean(process.stdin.isTTY);
}

/** One yes/no question; the prompt goes to stderr, so piping stdout cannot hide it. */
export async function askYesNo(question: string): Promise<boolean> {
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await terminal.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    terminal.close();
  }
}

/**
 * Resolve the root of the repo the cwd belongs to: the Git work-tree root, else
 * the cwd once the user confirms it. Never writes, never inspects what is there.
 */
export async function resolveTarget(cwd: string, environment: ResolveTargetEnvironment = {}): Promise<string> {
  const root = (environment.gitRoot ?? findGitRoot)(cwd);
  if (root) return resolve(root);

  // An injected confirm is a terminal for the caller's purposes; only the real one needs a TTY.
  const terminal = environment.isTTY ?? (Boolean(environment.confirm) || hasTerminal());
  if (!terminal) {
    throw new InitError(`no Git repository and no terminal to confirm the current directory (${resolve(cwd)})`);
  }

  const confirmed = await (environment.confirm ?? askYesNo)(
    `No Git repository found. Create the world in ${resolve(cwd)}? [y/N] `,
  );
  if (!confirmed) throw new InitError("the current directory was not confirmed; nothing written");
  return resolve(cwd);
}
