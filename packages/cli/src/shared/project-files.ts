/** The files a source entry names in the project directory: the one expansion, shared by check and review. */
import { type Dirent, readdirSync, realpathSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { compareText, isInside } from "./world-path.ts";

/** Bun's glob syntax: an entry with none of these characters is a plain path. */
const GLOB_CHARS = /[*?[\]{}!\\]/;

/** Directories a glob never walks into: version control and installed packages are never a node's code. */
const SKIPPED = new Set([".git", "node_modules"]);

/** One directory's own entries, by relative path: its files (linked ones inside included) and subdirectories. */
interface Listing {
  readonly files: readonly string[];
  readonly dirs: readonly string[];
}

/**
 * The files in the project directory `root` (named from the cwd), read lazily, each directory once per instance. Every
 * path is `/`-separated and relative to the project directory. Reads only, and knows nothing of nodes (C1).
 */
export class ProjectFiles {
  readonly #root: string;
  readonly #realRoot: string;
  /** Each directory listed, by its relative path ("" for the root). */
  readonly #listed = new Map<string, Listing>();

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
   * The relative directory `dir`'s own files and subdirectories (R1): a symlink to a file inside counts, one to a
   * directory is not followed, nor is a `dir` reached through one; .git and node_modules are left out; a missing or
   * unreadable one is empty.
   */
  #list(dir: string): Listing {
    const cached = this.#listed.get(dir);
    if (cached) return cached;
    let entries: Dirent[] = [];
    try {
      const path = join(this.#root, dir);
      if (realpathSync(path) === join(this.#realRoot, dir)) entries = readdirSync(path, { withFileTypes: true });
    } catch {}
    const files: string[] = [];
    const dirs: string[] = [];
    for (const entry of entries) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIPPED.has(entry.name)) dirs.push(path);
      } else if (entry.isFile() || (entry.isSymbolicLink() && this.#isFile(path))) files.push(path);
    }
    const listing = { files, dirs };
    this.#listed.set(dir, listing);
    return listing;
  }

  /** The files below the relative directory `dir`, at most `depth` levels down (1: its own files). */
  #below(dir: string, depth: number): string[] {
    if (depth < 1) return [];
    const { files, dirs } = this.#list(dir);
    return [...files, ...dirs.flatMap((sub) => this.#below(sub, depth - 1))];
  }

  /** Whether the relative `path`, normalized, is a directory inside the project directory. */
  isDirectory(path: string): boolean {
    try {
      const real = realpathSync(join(this.#root, posix.normalize(path)));
      return isInside(real, this.#realRoot) && statSync(real).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * One source entry's files, sorted (R2): normalized (`./src//a.ts` is `src/a.ts`), then a plain path if a file is
   * there, a glob the files below its segments before the first glob character that it matches, never inside .git
   * or node_modules; a glob without `**` or braces is read only as deep as its segments reach. Undefined when the
   * entry names a place outside the project directory: absolute, or starting with `..`.
   */
  expand(entry: string): readonly string[] | undefined {
    const path = posix.normalize(entry);
    if (posix.isAbsolute(path) || path === ".." || path.startsWith("../")) return undefined;
    if (!GLOB_CHARS.test(path)) return this.#isFile(path) ? [path] : [];
    const segments = path.split("/");
    const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
    // `**` crosses any number of directories and a brace may hold a `/`: those read the whole subtree.
    const depth = path.includes("**") || path.includes("{") ? Number.POSITIVE_INFINITY : segments.length - firstGlob;
    const base = segments.slice(0, firstGlob);
    if (base.some((segment) => SKIPPED.has(segment))) return [];
    const glob = new Bun.Glob(path);
    return this.#below(base.join("/"), depth)
      .filter((file) => glob.match(file))
      .sort(compareText);
  }
}
