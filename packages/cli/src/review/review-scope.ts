/** What a review of one node covers: both review programs derive it, so the prompt and the validation agree. */
import type { LoadedWorld } from "../load/load-world.ts";
import { compareText } from "../shared/diagnostics.ts";
import { CliError } from "../shared/failure.ts";
import { ProjectFiles } from "../shared/project-files.ts";
import { isGlob, matches, staticPrefix } from "../shared/source-path.ts";
import { nameInProject, suggestedCommand } from "../shared/world-path.ts";
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
 * One source entry's files as SourceRules finds them: a plain path if ProjectFiles has a file there, a glob the files
 * below its static prefix it matches. An entry leading out of the project directory finds nothing there.
 */
function entryFiles(project: ProjectFiles, entry: string): readonly string[] {
  const path = entry.replace(/^(\.\/)+/, "");
  if (!isGlob(path)) return project.isFile(path) ? [path] : [];
  return project.list(staticPrefix(path)).filter((file) => matches(path, file));
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
  const entries = entriesOf(spec.source);
  if (entries.length === 0) {
    const why = spec.external ? "it is external" : spec.abstract ? "it is a contract" : "it is not built yet";
    throw new CliError(`${path} has no source to review: ${why}; review a node whose source lists its code`);
  }
  const files = [...new Set(entries.flatMap((entry) => entryFiles(project, entry)))].sort(compareText);
  if (files.length === 0) {
    throw new CliError(
      `${path}'s source matches no file; ${suggestedCommand("check", [], root)} names the entry to fix`,
    );
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
    files: files.map((file) => nameInProject(root, file)),
    uses,
    drafts,
  };
}
