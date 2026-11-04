/** What a review of one node covers: both review programs derive it, so the prompt and the validation agree. */
import { constants } from "node:os";
import type { LoadedWorld } from "../load/load-world.ts";
import { CliError } from "../shared/failure.ts";
import { ProjectFiles } from "../shared/project-files.ts";
import { compareText, nameInProject, suggestedCommand } from "../shared/world-path.ts";
import { listItems, type SpecItem } from "./spec-items.ts";

/** A node the reviewed node may use: what the agent knows it by. */
export interface Dependency {
  /** Its hierarchy path. */
  readonly path: string;
  /** The ports used there. */
  readonly ports: readonly string[];
  /** Its source entries as written, named from the cwd, never expanded. */
  readonly source: readonly string[];
  readonly purpose: string;
  /** Not built by the project: the agent knows it by name and purpose alone. */
  readonly external: boolean;
}

/** A dependency not designed yet: a tbd placeholder the node uses, never reviewed against. */
export interface Draft {
  readonly description: string;
  /** Its export name, when a world file exports it. */
  readonly name?: string;
}

/** What a review of one node covers. */
export interface Scope {
  /** The node's hierarchy path. */
  readonly node: string;
  /** Its spec file, cwd-relative. */
  readonly specFile: string;
  readonly items: readonly SpecItem[];
  /** Its files, cwd-relative, each once, sorted. */
  readonly files: readonly string[];
  readonly uses: readonly Dependency[];
  readonly drafts: readonly Draft[];
}

/** A value as a list of strings: an unchecked world's source may hold anything. */
function entriesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * A directory the node's source reaches that cannot be read: a filesystem failure (Failure R1), so the review fails
 * with one line naming it, never an invalid argument.
 */
function unreadableError(path: string, dir: string, code: string): Error {
  const error = new Error(`${path}'s source reaches ${dir}, which cannot be read (${code}); make it readable`);
  return Object.assign(error, { code, errno: (constants.errno as Record<string, number>)[code] ?? -1 });
}

/**
 * The scope of a review of the node at `position` in the world loaded from the project directory `root` (named from
 * the cwd): its spec items, its files, the nodes it may use and the drafts it uses (R2–R4). A node that is not
 * reviewable is one CliError saying why, an invalid argument (R1): a dome, a node without source, or one whose source
 * matches no file. `project` shares its directory reads with the caller.
 */
export function reviewScope(
  root: string,
  world: LoadedWorld,
  position: number,
  project: ProjectFiles = new ProjectFiles(root),
): Scope {
  const node = world.nodes[position];
  if (node === undefined) throw new CliError(`no node at position ${position}`);
  const { spec, path } = node;
  if (node.children.length > 0) {
    throw new CliError(
      `${path} is a dome, and a review covers one leaf; ${suggestedCommand("tree", [path], root)} lists its children`,
    );
  }
  const check = suggestedCommand("check", [], root);
  if (!Array.isArray(spec.source)) {
    throw new CliError(`${path}'s source is not a list; ${check} names what to fix`);
  }
  const entries = entriesOf(spec.source);
  if (entries.length === 0) {
    const why = spec.external ? "it is external" : spec.abstract ? "it is a contract" : "it is not built yet";
    throw new CliError(`${path} has no source to review: ${why}; review a node whose source lists its code`);
  }
  // Each entry as check expands it (SourceRules R1): a refused one matches nothing here either.
  const expansions = entries.map((entry) => project.expand(entry));
  const unreadable = expansions.flatMap((expansion) => ("unreadable" in expansion ? expansion.unreadable : []))[0];
  if (unreadable !== undefined) throw unreadableError(path, nameInProject(root, unreadable.dir), unreadable.code);
  // Named first, then deduplicated: `./src/a.ts` and `src/a.ts` are one file.
  const named = expansions.flatMap((expansion) => ("files" in expansion ? expansion.files : []));
  const files = [...new Set(named.map((file) => nameInProject(root, file)))].sort(compareText);
  if (files.length === 0) {
    throw new CliError(`${path}'s source matches no file; ${check} names the entry to fix`);
  }
  const uses = node.uses.flatMap(({ to, port }): Dependency[] => {
    const target = to === null ? undefined : world.nodes[to];
    if (target === undefined) return [];
    return [
      {
        path: target.path,
        ports: port,
        source: entriesOf(target.spec.source).map((entry) => nameInProject(root, entry)),
        purpose: typeof target.spec.purpose === "string" ? target.spec.purpose : "",
        external: target.spec.external === true,
      },
    ];
  });
  const drafts = world.placeholders
    .filter((placeholder) => placeholder.users.includes(spec.id))
    .map(({ description, name }): Draft => (name === undefined ? { description } : { description, name }));
  return {
    node: path,
    specFile: node.file,
    items: listItems(world, position),
    files,
    uses,
    drafts,
  };
}
