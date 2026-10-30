import { type Dirent, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, posix, resolve, sep } from "node:path";
import type { LoadedWorld } from "../../load/load-world.ts";
import type { Finding } from "../diagnostics.ts";
import { at, type TreeNode, worldTree } from "./world-tree.ts";

/** Bun's glob syntax: an entry with none of these characters is a plain path. */
const GLOB_CHARS = /[*?[\]{}!\\]/;

/**
 * The project's files, read lazily and at most once per directory: every path is `/`-separated and relative to the
 * project directory, and no symlink is followed out of it (SourceRules R1, R2).
 */
class ProjectFiles {
  readonly #root: string;
  readonly #realRoot: string;
  /** Each directory read, by its relative path ("" for the root): the files below it, at any depth. */
  readonly #below = new Map<string, readonly string[]>();

  constructor(root: string) {
    this.#root = resolve(root);
    this.#realRoot = realpathSync(this.#root);
  }

  /** Whether a real path lies inside the project directory. */
  #inside(real: string): boolean {
    return real === this.#realRoot || real.startsWith(`${this.#realRoot}${sep}`);
  }

  /** The real path behind a relative path, if it exists and stays inside the project directory. */
  #real(path: string): string | undefined {
    try {
      const real = realpathSync(join(this.#root, path));
      return this.#inside(real) ? real : undefined;
    } catch {
      return undefined;
    }
  }

  /** Whether `path` names a file inside the project directory, through symlinks that stay inside. */
  isFile(path: string): boolean {
    const real = this.#real(path);
    return real !== undefined && (statSync(real, { throwIfNoEntry: false })?.isFile() ?? false);
  }

  /** Every file below the directory `dir` ("" for the project directory), each directory read once. */
  filesBelow(dir: string, visiting: ReadonlySet<string> = new Set()): readonly string[] {
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
    } catch {
      entries = [];
    }
    const files: string[] = [];
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isFile()) files.push(path);
      else if (entry.isDirectory()) files.push(...this.filesBelow(path, inner));
      else if (entry.isSymbolicLink()) {
        if (this.isFile(path)) files.push(path);
        else files.push(...this.filesBelow(path, inner));
      }
    }
    this.#below.set(dir, files);
    return files;
  }
}

/** An entry, checked: the files it matches, or why it names no place inside the project directory. */
type Expansion = { readonly files: readonly string[] } | { readonly outside: true };

/** One source entry's matches; plain paths are checked directly, globs expanded below their static prefix. */
function expand(project: ProjectFiles, entry: string): Expansion {
  const path = posix.normalize(entry.replace(/^(\.\/)+/, ""));
  if (isAbsolute(entry) || path === ".." || path.startsWith("../")) return { outside: true };
  if (!GLOB_CHARS.test(path)) return { files: project.isFile(path) ? [path] : [] };
  const segments = path.split("/");
  const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
  const prefix = segments.slice(0, firstGlob).join("/");
  const glob = new Bun.Glob(path);
  return { files: project.filesBelow(prefix).filter((file) => glob.match(file)) };
}

/** A node or the world, as a source's owner: where its findings point and how they name it. */
interface Owner {
  readonly node?: TreeNode;
  readonly file: string;
  readonly line?: number;
  readonly label: string;
}

/**
 * The source rules (SpecCheck R6, R7, R10): every entry exists, every node's files lie under the world's source, and
 * each file has one owner, nesting aside. Reads the project directory `root`, named from the cwd; every glob shares one
 * set of directory reads.
 */
export function checkSourceRules(root: string, world: LoadedWorld): Finding[] {
  const tree = worldTree(world);
  const project = new ProjectFiles(root);
  const findings: Finding[] = [];
  const error = (owner: Owner, rule: string, fix: string) =>
    findings.push({
      severity: "error",
      file: owner.file,
      ...(owner.line === undefined ? {} : { line: owner.line }),
      ...(owner.node ? { node: owner.node.path } : {}),
      rule,
      fix,
    });

  /** R3: the entries of a source that is a list, strings only; anything else is an error, never a crash. */
  const entriesOf = (owner: Owner, source: unknown): string[] | undefined => {
    if (!Array.isArray(source)) {
      error(owner, `${owner.label}'s source is not a list`, 'make it a list of paths or globs, e.g. ["src/**"]');
      return undefined;
    }
    const entries: string[] = [];
    for (const entry of source) {
      if (typeof entry === "string") entries.push(entry);
      else {
        error(owner, `${owner.label}'s source lists ${describe(entry)}, which is not a string`, "list paths or globs");
      }
    }
    return entries;
  };

  // The world's source: inside the project directory, every entry matching a file (R10, R6).
  const worldOwner: Owner = { file: world.file, label: "the world" };
  const worldEntries = entriesOf(worldOwner, world.source);
  let covered: Set<string> | undefined;
  if (worldEntries) {
    covered = new Set();
    for (const entry of worldEntries) {
      const expansion = expand(project, entry);
      if ("outside" in expansion) {
        error(
          worldOwner,
          `the world's source entry "${entry}" lies outside the project directory`,
          "list only paths inside the project directory, or run check with --path at the directory holding the code",
        );
        continue;
      }
      if (!expansion.files.length) {
        error(
          worldOwner,
          `the world's source entry "${entry}" matches no file`,
          "fix the path or glob, or drop the entry",
        );
      }
      for (const file of expansion.files) covered.add(file);
    }
  }

  // Each node's source (R6, R10); the files it matches feed the ownership rule (R7).
  const owners = new Map<string, TreeNode[]>();
  for (const node of tree.nodes) {
    if (tree.duplicated.has(node.spec.id)) continue;
    const owner: Owner = { node, ...at(node), label: node.spec.name };
    const entries = entriesOf(owner, (node.spec as { source?: unknown }).source);
    for (const entry of entries ?? []) {
      const expansion = expand(project, entry);
      if ("outside" in expansion) {
        error(
          owner,
          `source entry "${entry}" lies outside the project directory, so outside the world's source`,
          "list only paths inside the world's source",
        );
        continue;
      }
      if (!expansion.files.length) {
        error(owner, `source entry "${entry}" matches no file`, "fix the path or glob, or drop the entry");
        continue;
      }
      const uncovered = covered && expansion.files.find((file) => !covered.has(file));
      if (uncovered !== undefined) {
        error(
          owner,
          `source entry "${entry}" matches ${uncovered}, which is not under the world's source`,
          `narrow the entry to the world's source, or add the file to the world's source in ${world.file}`,
        );
      }
      for (const file of expansion.files) {
        const claimed = owners.get(file) ?? [];
        if (!claimed.includes(node)) claimed.push(node);
        owners.set(file, claimed);
      }
    }
  }

  // R7: one owner per file, unless one owner is the other's ancestor.
  for (const [file, claimed] of owners) {
    for (const [index, node] of claimed.entries()) {
      for (const other of claimed.slice(0, index)) {
        if (tree.isAncestor(other, node) || tree.isAncestor(node, other)) continue;
        const [first, second] = other.index < node.index ? [other, node] : [node, other];
        error(
          { node: second, ...at(second), label: second.spec.name },
          `${file} is in the source of both ${first.path} (${first.file}) and ${second.path}`,
          "keep the file in one node's source, or move the shared code into a node of its own",
        );
      }
    }
  }
  return findings;
}

function describe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
