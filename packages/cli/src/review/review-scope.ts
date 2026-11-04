/** What a review of one node covers: both review programs derive it, so the prompt and the validation agree. */
import { constants } from "node:os";
import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { CliError, inWords } from "../shared/failure.ts";
import { findNode } from "../shared/node-path.ts";
import { ProjectFiles } from "../shared/project-files.ts";
import { invalidFrom, type Report } from "../shared/report.ts";
import { compareText, nameInProject, suggestedCommand } from "../shared/world-path.ts";
import { list, type SpecItem, targets } from "./spec-items.ts";

/** A node the reviewed node may use: what the agent knows it by. */
export interface Dependency {
  /** Its hierarchy path; an unreachable target's name, as its uses edge item cites it. */
  readonly path: string;
  /** The ports used there. */
  readonly ports: readonly string[];
  /** Its source entries as written, named from the cwd, never expanded. */
  readonly source: readonly string[];
  readonly purpose: string;
  /** Not built by the project: the agent knows it by name and purpose alone. */
  readonly external: boolean;
  /** A node the world never reaches (an orphan): known by its edge alone, and check reports it. */
  readonly unreachable?: true;
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
  /** The reference examples cite, in the prompt and in what submit answers: the first requirement's, else purpose. */
  readonly example: string;
  /** Its files, cwd-relative, each once, sorted. */
  readonly files: readonly string[];
  readonly uses: readonly Dependency[];
  readonly drafts: readonly Draft[];
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
 * reviewable is one CliError saying why, an invalid argument (R1): a dome, a source that is no list, a node without
 * source, or one whose source matches no file. `project` shares its directory reads with the caller.
 */
export function scope(
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
  if (!Array.isArray(spec.source)) throw new CliError(`${path}'s source is not a list; ${check} names what to fix`);
  const entries = (spec.source as unknown[]).filter((entry) => typeof entry === "string");
  if (entries.length === 0) {
    const why = spec.external ? "it is external" : spec.abstract ? "it is a contract" : "it is not built yet";
    throw new CliError(`${path} has no source to review: ${why}; review a node whose source lists its code`);
  }
  // Each entry as check expands it (ProjectFiles.expand): a refused one matches nothing here either.
  const expansions = entries.map((entry) => project.expand(entry));
  const unreadable = expansions.flatMap((expansion) => ("unreadable" in expansion ? expansion.unreadable : []))[0];
  if (unreadable !== undefined) throw unreadableError(path, nameInProject(root, unreadable.dir), unreadable.code);
  const named = expansions.flatMap((expansion) => ("files" in expansion ? expansion.files : []));
  // R8: check refuses whitespace in a reference or a file name, so every one prints and is taken back as is.
  const items = list(world, position);
  const spaced = [path, ...items.map((item) => item.ref), ...named].find((text) => /\s/u.test(text));
  if (spaced !== undefined) {
    throw new CliError(
      `${path}'s review would cite ${inWords(spaced)}, which holds whitespace; ${check} names what to fix`,
    );
  }
  // Each file once, however many entries name it.
  const files = [...new Set(named.map((file) => nameInProject(root, file)))].sort(compareText);
  if (files.length === 0) throw new CliError(`${path}'s source matches no file; ${check} names the entry to fix`);
  const uses = targets(world, position).map(({ name, ports, node: target, source, purpose }): Dependency => {
    if (target === undefined) return { path: name, ports, source: [], purpose: "", external: false, unreachable: true };
    const named = source.map((entry) => nameInProject(root, entry));
    return { path: target.path, ports, source: named, purpose, external: target.spec.external === true };
  });
  const drafts = world.placeholders
    .filter((placeholder) => placeholder.users.includes(spec.id))
    .map(({ description, name }): Draft => (name === undefined ? { description } : { description, name }));
  return {
    node: path,
    specFile: node.file,
    items,
    example: items.find((item) => item.kind === "requirement")?.ref ?? "purpose",
    files,
    uses,
    drafts,
  };
}

/**
 * Both programs' first steps (R6): load the world from the project directory `root` (named from the cwd), find the
 * node at hierarchy path `node`, its scope. A path naming no node or a node that is not reviewable is the invalid
 * Report of its one line; no world, a load failure or an unreadable directory is thrown, for the program to report
 * as failed.
 */
export async function scopeAt(root: string, node: string): Promise<Scope | Report> {
  const world = await loadWorld(root);
  try {
    return scope(root, world, findNode(world, node, root));
  } catch (error) {
    if (error instanceof CliError) return invalidFrom(error);
    throw error;
  }
}
