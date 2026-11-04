/** What a review of one node covers: both review programs derive it, so the prompt and the validation agree. */
import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { CliError, inWords } from "../shared/failure.ts";
import { findNode } from "../shared/node-path.ts";
import { ProjectFiles } from "../shared/project-files.ts";
import { invalidFrom, type Report } from "../shared/report.ts";
import { compareText, nameInProject, suggestedCommand } from "../shared/world-path.ts";
import { list, type SpecItem, type Target, targets } from "./spec-items.ts";

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
  /** The uses edges' targets (SpecItems.targets), each one's source entries named from the cwd, never expanded. */
  readonly uses: readonly Target[];
  readonly drafts: readonly Draft[];
}

/** Why a node is not reviewable (R1): an invalid argument, as a path naming no node is. */
class NotReviewable extends CliError {}

/**
 * The scope of a review of the node at `position` in the world loaded from the project directory `root` (named from
 * the cwd): its spec items, its files, the nodes it may use and the drafts it uses (R2–R4). A node that is not
 * reviewable is one NotReviewable (a CliError) saying why, an invalid argument (R1): a dome, a source that is no list, a node without
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
    throw new NotReviewable(
      `${path} is a dome, and a review covers one leaf; ${suggestedCommand("tree", [path], root)} lists its children`,
    );
  }
  const check = suggestedCommand("check", [], root);
  if (!Array.isArray(spec.source))
    throw new NotReviewable(`${path}'s source is not a list; ${check} names what to fix`);
  const entries = (spec.source as unknown[]).filter((entry) => typeof entry === "string");
  if (entries.length === 0) {
    const why = spec.external ? "it is external" : spec.abstract ? "it is a contract" : "it is not built yet";
    throw new NotReviewable(`${path} has no source to review: ${why}; review a node whose source lists its code`);
  }
  // Each entry as check expands it (ProjectFiles.expand): a refused one matches nothing here either.
  const expansions = entries.map((entry) => project.expand(entry));
  const unreadable = expansions.flatMap((expansion) => ("unreadable" in expansion ? expansion.unreadable : []))[0];
  if (unreadable !== undefined) {
    // A failure, not an invalid argument (R2): a plain CliError, which scopeAt lets through for the program to report.
    const dir = nameInProject(root, unreadable.dir);
    throw new CliError(`${path}'s source reaches ${dir}, which cannot be read (${unreadable.code}); make it readable`);
  }
  const named = expansions.flatMap((expansion) => ("files" in expansion ? expansion.files : []));
  // R8: check refuses whitespace in a reference or a file name, so every one prints and is taken back as is.
  const items = list(world, position);
  const spaced = [path, ...items.map((item) => item.ref), ...named].find((text) => /\s/u.test(text));
  if (spaced !== undefined) {
    throw new NotReviewable(
      `${path}'s review would cite ${inWords(spaced)}, which holds whitespace; ${check} names what to fix`,
    );
  }
  // Each file once, however many entries name it.
  const files = [...new Set(named.map((file) => nameInProject(root, file)))].sort(compareText);
  if (files.length === 0) throw new NotReviewable(`${path}'s source matches no file; ${check} names the entry to fix`);
  const uses = targets(world, position).map((target) => ({
    ...target,
    source: target.source.map((entry) => nameInProject(root, entry)),
  }));
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
  let position: number;
  try {
    position = findNode(world, node, root);
  } catch (error) {
    if (error instanceof CliError) return invalidFrom(error);
    throw error;
  }
  try {
    return scope(root, world, position);
  } catch (error) {
    if (error instanceof NotReviewable) return invalidFrom(error);
    throw error;
  }
}
