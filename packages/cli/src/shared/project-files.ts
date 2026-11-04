/** The files that exist in the project directory and which a source entry names: the one walk, shared by check and review. */
import { type Dirent, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { isGlob, matches, staticPrefix } from "./source-path.ts";
import { compareText, isInside } from "./world-path.ts";

/** Errno codes that mean nothing is there: a missing entry, a path through a file, or a symlink cycle (R1). */
const NOTHING_THERE = new Set(["ENOENT", "ENOTDIR", "ELOOP"]);

/** A thrown errno code: what failed reading a path. */
function codeOf(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code ?? "unknown error");
}

/** A directory a listing could not read (R3), by its `/`-separated path and the errno code saying why: EACCES. */
export interface Unreadable {
  readonly dir: string;
  readonly code: string;
}

/** The files below a directory, sorted by code unit, and the directories below it that could not be read. */
export interface Listing {
  readonly files: readonly string[];
  readonly unreadable: readonly Unreadable[];
}

/**
 * A source entry's files (R4), or why it is refused: it names a place outside the project directory (absolute, or
 * starting with `..`), or it climbs back with a `..` segment inside it.
 */
export type Expansion = Listing | { readonly refused: "outside" | "climbs" };

/** What is at a path: a file or a directory, by its real path, or a failure to read it; undefined when nothing is. */
type Found = { readonly kind: "file" | "dir"; readonly real: string } | { readonly code: string } | undefined;

/**
 * The files in the project directory `root` (named from the cwd), read lazily. Every path is `/`-separated and
 * relative to the project directory, and no symlink is followed out of it (R1). Each real directory is read at most
 * once per instance, and a listing is cached whole: the same question gets the same answer whatever was asked before
 * (R2). Reads only, and knows nothing of nodes (C1).
 */
export class ProjectFiles {
  readonly #root: string;
  readonly #realRoot: string;
  /** What is at each path looked at, by its relative path. */
  readonly #found = new Map<string, Found>();
  /** Each real directory read: its entries in code-unit order, or the errno code reading it failed with. */
  readonly #reads = new Map<string, readonly Dirent[] | string>();
  /** Each listing answered, by its directory's relative path ("" for the root). */
  readonly #listings = new Map<string, Listing>();

  constructor(root: string) {
    this.#root = resolve(root);
    this.#realRoot = realpathSync(this.#root);
  }

  /** What is at a relative path, inside the project directory, through symlinks that stay inside. */
  #at(path: string): Found {
    if (this.#found.has(path)) return this.#found.get(path);
    let found: Found;
    try {
      const real = realpathSync(join(this.#root, path));
      const stat = isInside(real, this.#realRoot) ? statSync(real, { throwIfNoEntry: false }) : undefined;
      found = stat?.isFile() ? { kind: "file", real } : stat?.isDirectory() ? { kind: "dir", real } : undefined;
    } catch (error) {
      found = NOTHING_THERE.has(codeOf(error)) ? undefined : { code: codeOf(error) };
    }
    this.#found.set(path, found);
    return found;
  }

  /** A real directory's entries, in code-unit order, read once; the errno code when reading it failed. */
  #read(real: string): readonly Dirent[] | string {
    let entries = this.#reads.get(real);
    if (entries === undefined) {
      try {
        entries = readdirSync(real, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
      } catch (error) {
        entries = NOTHING_THERE.has(codeOf(error)) ? [] : codeOf(error);
      }
      this.#reads.set(real, entries);
    }
    return entries;
  }

  /** Whether a file exists at the `/`-separated `path`, inside the project directory, through symlinks that stay inside. */
  isFile(path: string): boolean {
    return this.realPath(path) !== undefined;
  }

  /**
   * The real path of the file at the `/`-separated `path`, through symlinks that stay inside; undefined when no file is
   * there. Two names of one file through a symlink share it (R5).
   */
  realPath(path: string): string | undefined {
    const found = this.#at(path);
    return found !== undefined && "kind" in found && found.kind === "file" ? found.real : undefined;
  }

  /**
   * The files below the `/`-separated directory `dir` ('' for the project directory), at any depth, sorted by code
   * unit; none for a missing directory. Breadth-first, in code-unit order, each real directory walked once: a symlink
   * to a directory the walk already reached adds nothing, so cycles and meshes of links end (R1). A directory that
   * cannot be read is listed as unreadable, never thrown (R3).
   */
  list(dir: string): Listing {
    const cached = this.#listings.get(dir);
    if (cached) return cached;
    const files: string[] = [];
    const unreadable: Unreadable[] = [];
    const start = this.#at(dir);
    const queue: [path: string, real: string][] = [];
    const walked = new Set<string>();
    if (start !== undefined && "code" in start) unreadable.push({ dir, code: start.code });
    else if (start?.kind === "dir") {
      queue.push([dir, start.real]);
      walked.add(start.real);
    }
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const [path, real] = next;
      const entries = this.#read(real);
      if (typeof entries === "string") {
        unreadable.push({ dir: path, code: entries });
        continue;
      }
      for (const entry of entries) {
        const child = path ? `${path}/${entry.name}` : entry.name;
        if (entry.isFile()) {
          files.push(child);
          continue;
        }
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        const found = this.#at(child);
        if (found === undefined) continue;
        if ("code" in found) unreadable.push({ dir: child, code: found.code });
        else if (found.kind === "file") files.push(child);
        else if (!walked.has(found.real)) {
          walked.add(found.real);
          queue.push([child, found.real]);
        }
      }
    }
    // Sorted whole: a directory's files beside a sibling file sharing its prefix (`a/x` and `a.ts`) by code unit.
    const listing = {
      files: files.sort(compareText),
      unreadable: unreadable.sort((a, b) => compareText(a.dir, b.dir)),
    };
    this.#listings.set(dir, listing);
    return listing;
  }

  /**
   * One source entry's files (R4): a plain path if a file is there, a glob the files below its static prefix it
   * matches (Path), with the directories that walk could not read. Never normalized beyond a leading `./`: a pattern is
   * matched as written, so an entry with a `..` segment, or an absolute one, is refused and matches nothing.
   */
  expand(entry: string): Expansion {
    const path = entry.replace(/^(\.\/)+/, "");
    const segments = path.split("/");
    if (isAbsolute(entry) || segments[0] === "..") return { refused: "outside" };
    if (segments.includes("..")) return { refused: "climbs" };
    if (!isGlob(path)) return { files: this.isFile(path) ? [path] : [], unreadable: [] };
    const { files, unreadable } = this.list(staticPrefix(path));
    return { files: files.filter((file) => matches(path, file)), unreadable };
  }
}
