/** The files a source entry names in the project directory: the one expansion, shared by check and review. */
import { type Dirent, readdirSync, realpathSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { compareText, isInside } from "./world-path.ts";

/** Bun's glob syntax: an entry with none of these characters is a plain path. */
const GLOB_CHARS = /[*?[\]{}!\\]/;

/**
 * The files in the project directory `root` (named from the cwd), read lazily, each directory once per instance. Every
 * path is `/`-separated and relative to the project directory. Reads only, and knows nothing of nodes (C1).
 */
export class ProjectFiles {
  readonly #root: string;
  readonly #realRoot: string;
  /** The files below each directory listed, by its relative path ("" for the root). */
  readonly #below = new Map<string, readonly string[]>();

  constructor(root: string) {
    this.#root = resolve(root);
    this.#realRoot = realpathSync(this.#root);
  }

  /** Whether a file is at the relative `path`, through symlinks that stay inside the project directory (R1). */
  #isFile(path: string): boolean {
    try {
      const real = realpathSync(join(this.#root, path));
      return isInside(real, this.#realRoot) && statSync(real).isFile();
    } catch {
      return false;
    }
  }

  /**
   * The files below the relative directory `dir`, at any depth, sorted by code unit (R1): a symlink to a file inside
   * counts, one to a directory is not followed, nor is a `dir` reached through one; a missing or unreadable one is empty.
   */
  #list(dir: string): readonly string[] {
    const cached = this.#below.get(dir);
    if (cached) return cached;
    let entries: Dirent[] = [];
    try {
      const path = join(this.#root, dir);
      if (realpathSync(path) === join(this.#realRoot, dir)) entries = readdirSync(path, { withFileTypes: true });
    } catch {}
    const files = entries
      .flatMap((entry) => {
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) return this.#list(path);
        return entry.isFile() || (entry.isSymbolicLink() && this.#isFile(path)) ? [path] : [];
      })
      .sort(compareText);
    this.#below.set(dir, files);
    return files;
  }

  /**
   * One source entry's files, sorted (R2): normalized (`./src//a.ts` is `src/a.ts`), then a plain path if a file is
   * there, a glob the files below its segments before the first glob character that it matches. Undefined when the
   * entry names a place outside the project directory: absolute, or starting with `..`.
   */
  expand(entry: string): readonly string[] | undefined {
    const path = posix.normalize(entry);
    if (posix.isAbsolute(path) || path === ".." || path.startsWith("../")) return undefined;
    if (!GLOB_CHARS.test(path)) return this.#isFile(path) ? [path] : [];
    const segments = path.split("/");
    const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
    const glob = new Bun.Glob(path);
    return this.#list(segments.slice(0, firstGlob).join("/")).filter((file) => glob.match(file));
  }
}
