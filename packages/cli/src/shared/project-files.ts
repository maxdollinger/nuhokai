/** The files that exist in the project directory: the one walk of them, shared by check and review. */
import { type Dirent, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { compareText } from "./diagnostics.ts";
import { isInside } from "./world-path.ts";

/** Errno codes that mean nothing is there: a missing entry, a path through a file, or a symlink cycle (R1). */
const NOTHING_THERE = new Set(["ENOENT", "ENOTDIR", "ELOOP"]);

/** Whether a thrown value says nothing is at the path, rather than that reading it failed. */
function nothingThere(error: unknown): boolean {
  return NOTHING_THERE.has(String((error as { code?: unknown } | null)?.code));
}

/**
 * The files in the project directory `root` (named from the cwd), read lazily and each directory at most once per
 * instance (R2). Every path is `/`-separated and relative to the project directory, and no symlink is followed out of
 * it (R1). Reads only: knows nothing of nodes or globs (C1).
 */
export class ProjectFiles {
  readonly #root: string;
  readonly #realRoot: string;
  /** Each directory read, by its relative path ("" for the root): the files below it, at any depth. */
  readonly #below = new Map<string, readonly string[]>();

  constructor(root: string) {
    this.#root = resolve(root);
    this.#realRoot = realpathSync(this.#root);
  }

  /** The real path behind a relative path, if something is there inside the project directory; else undefined. */
  #real(path: string): string | undefined {
    let real: string;
    try {
      real = realpathSync(join(this.#root, path));
    } catch (error) {
      if (nothingThere(error)) return undefined;
      throw error;
    }
    return isInside(real, this.#realRoot) ? real : undefined;
  }

  /** Whether a file exists at the `/`-separated `path`, inside the project directory, through symlinks that stay inside. */
  isFile(path: string): boolean {
    try {
      const real = this.#real(path);
      return real !== undefined && (statSync(real, { throwIfNoEntry: false })?.isFile() ?? false);
    } catch {
      return false;
    }
  }

  /**
   * The files below the `/`-separated directory `dir` ('' for the project directory), at any depth, sorted by code
   * unit; none for a missing directory. An errno failure other than a missing entry is thrown.
   */
  list(dir: string): readonly string[] {
    return this.#list(dir, new Set());
  }

  #list(dir: string, visiting: ReadonlySet<string>): readonly string[] {
    const cached = this.#below.get(dir);
    if (cached) return cached;
    const real = this.#real(dir);
    if (real === undefined || visiting.has(real) || !statSync(real, { throwIfNoEntry: false })?.isDirectory()) {
      return [];
    }
    const inner = new Set([...visiting, real]);
    let entries: Dirent[];
    try {
      entries = readdirSync(join(this.#root, dir), { withFileTypes: true });
    } catch (error) {
      if (!nothingThere(error)) throw error;
      entries = [];
    }
    const files: string[] = [];
    for (const entry of entries.sort((a, b) => compareText(a.name, b.name))) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isFile()) files.push(path);
      else if (entry.isDirectory()) files.push(...this.#list(path, inner));
      else if (entry.isSymbolicLink()) {
        if (this.isFile(path)) files.push(path);
        else files.push(...this.#list(path, inner));
      }
    }
    // Sorted whole: a directory's files beside a sibling file sharing its prefix (`a/x` and `a.ts`) by code unit.
    files.sort(compareText);
    this.#below.set(dir, files);
    return files;
  }
}
