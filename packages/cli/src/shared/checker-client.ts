/**
 * The CLI's one client of its pinned type checker: where the executable is, and a session on one project that always
 * closes. LoadWorld reads with it, TypeCheck checks with it; neither reaches into the other.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { API, type Project } from "typescript/unstable/async";
import { CliError, errorLine } from "./failure.ts";

/**
 * The CLI's pinned checker. The compiled CLI uses the tsgo the release ships as a sidecar next to the binary
 * (`tsgo/tsgo`); from source or the bundle, the platform build of the CLI's pinned `typescript`. Never the repo's own
 * TypeScript.
 */
export function checkerPath(): string {
  if (import.meta.dir.startsWith("/$bunfs")) {
    const sidecar = join(dirname(process.execPath), "tsgo", "tsgo");
    if (existsSync(sidecar)) return sidecar;
    throw new CliError(`no type checker: expected ${sidecar}, which ships next to the nuhokai binary`);
  }
  const platform = `@typescript/typescript-${process.platform}-${process.arch}`;
  try {
    const typescript = dirname(Bun.resolveSync("typescript/package.json", import.meta.dir));
    const binary = join(dirname(Bun.resolveSync(`${platform}/package.json`, typescript)), "lib", "tsc");
    if (existsSync(binary)) return binary;
  } catch {
    // Not installed: the failure below says so.
  }
  throw new CliError(`no type checker: ${platform} is not installed; run bun install`);
}

/** A checker or API failure as one CliError; a CliError of ours passes as it is. */
function checkerFailure(error: unknown): CliError {
  return error instanceof CliError ? error : new CliError(`the type checker failed: ${errorLine(error)}`);
}

/** A JavaScript runtime error: a bug in our code or the client's, never a checker failure to explain. */
function isProgrammingError(error: unknown): boolean {
  return error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError;
}

/** How to reach the checker: from `root`, the tsconfig at `config` (absolute), named `name` in messages. */
export interface CheckerSession {
  readonly root: string;
  readonly config: string;
  readonly name: string;
  /** The checker's executable. */
  readonly checker: string;
  /** Files the checker reads from memory instead of the disk, by absolute path, such as a tsconfig never written. */
  readonly virtual?: ReadonlyMap<string, string>;
}

/**
 * Open the session's project in the checker and answer what `use` makes of it. Every checker failure, its closing
 * included, is one CliError, a CliError of ours as it is; a failure closing the checker after another never hides that
 * other. A programming error is no checker failure: it propagates with its stack. LoadWorld and TypeCheck share it,
 * so both talk to the checker the same way.
 */
export async function withChecker<T>(session: CheckerSession, use: (project: Project) => Promise<T>): Promise<T> {
  const { root, config, name, checker, virtual } = session;
  let api: API;
  try {
    api = new API({
      cwd: resolve(root),
      tsserverPath: checker,
      ...(virtual && {
        fs: {
          readFile: (path: string) => virtual.get(resolve(path)),
          fileExists: (path: string) => (virtual.has(resolve(path)) ? true : undefined),
        },
      }),
    });
  } catch (error) {
    throw checkerFailure(error);
  }
  let result: T;
  try {
    const snapshot = await api.updateSnapshot({ openProject: config });
    const project = snapshot.getProject(config);
    if (!project) throw new CliError(`${name}: the type checker opened no project for it`);
    result = await use(project);
  } catch (error) {
    await api.close().catch(() => {});
    if (isProgrammingError(error)) throw error;
    throw checkerFailure(error);
  }
  try {
    await api.close();
  } catch (error) {
    throw checkerFailure(error);
  }
  return result;
}
