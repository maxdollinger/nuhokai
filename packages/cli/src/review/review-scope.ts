/** What a review of one node covers: both review programs derive it, so the prompt and the validation agree. */
import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { CliError } from "../shared/failure.ts";
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

/**
 * The scope of a review of the node at `position` in the world loaded from the project directory `root` (named from
 * the cwd): its spec items, its files, the nodes it may use and the drafts it uses (R2–R4). A node that is not
 * reviewable is one CliError saying why (R1): a dome, a node without source, or one whose source matches no file.
 */
export function scope(root: string, world: LoadedWorld, position: number): Scope {
  const node = world.nodes[position];
  if (node === undefined) throw new Error(`no node at position ${position}`);
  const { spec, path } = node;
  if (node.children.length > 0) {
    throw new CliError(
      `${path} is a dome, and a review covers one leaf; ${suggestedCommand("tree", [path], root)} lists its children`,
    );
  }
  // A source that is not a list, check's to report, is no source here.
  const source: unknown[] = Array.isArray(spec.source) ? spec.source : [];
  const entries = source.filter((entry) => typeof entry === "string");
  if (entries.length === 0) {
    const why = spec.external ? "it is external" : spec.abstract ? "it is a contract" : "it is not built yet";
    throw new CliError(`${path} has no source to review: ${why}; review a node whose source lists its code`);
  }
  // Each entry as check expands it (ProjectFiles.expand), each file once, however many entries name it.
  const project = new ProjectFiles(root);
  const named = entries.flatMap((entry) => project.expand(entry) ?? []);
  const files = [...new Set(named.map((file) => nameInProject(root, file)))].sort(compareText);
  if (files.length === 0) {
    const check = suggestedCommand("check", [], root);
    throw new CliError(`${path}'s source matches no file; ${check} names the entry to fix`);
  }
  const items = list(world, position);
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
 * Report of its one line; no world or a load failure is thrown, for the program to report as failed.
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
