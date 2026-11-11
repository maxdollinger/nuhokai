/** What a review of one node covers: both review programs derive it, so the prompt and the validation agree. */
import { type LoadedNode, type LoadedWorld, loadWorld, type Placeholder } from "../load/load-world.ts";
import { InvalidArgument } from "../shared/failure.ts";
import { findNode } from "../shared/node-path.ts";
import { ProjectFiles } from "../shared/project-files.ts";
import { compareText, nameInProject, suggestedCommand } from "../shared/world-path.ts";
import { list, type SpecItem, type Target, targets } from "./spec-items.ts";

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
  /** The uses edges' targets, as SpecItems.targets gives them. */
  readonly uses: readonly Target[];
  /** The tbd placeholders the node uses: dependencies not designed yet, never reviewed against. */
  readonly drafts: readonly Placeholder[];
}

/**
 * The scope of a review of `node` in the world loaded from the project directory `root` (named from
 * the cwd): its spec items, its files, the nodes it may use and the drafts it uses (R2–R4). A node that is not
 * reviewable is one InvalidArgument saying why (R1): a dome, a node without source, or one whose source matches no file.
 */
function scope(root: string, world: LoadedWorld, node: LoadedNode): Scope {
  const { spec, path } = node;
  if (node.children.length > 0) {
    throw new InvalidArgument(
      `${path} is a dome, and a review covers one leaf; ${suggestedCommand("tree", [path], root)} lists its children`,
    );
  }
  // A source LoadWorld had to replace is empty here; check reports why (LoadWorld R16).
  const entries = spec.source;
  if (entries.length === 0) {
    const why = spec.external ? "it is external" : spec.abstract ? "it is a contract" : "it is not built yet";
    throw new InvalidArgument(`${path} has no source to review: ${why}; review a node whose source lists its code`);
  }
  // Each entry as check expands it (ProjectFiles.expand), each file once, however many entries name it.
  const project = new ProjectFiles(root);
  const named = entries.flatMap((entry) => project.expand(entry) ?? []);
  const files = [...new Set(named.map((file) => nameInProject(root, file)))].sort(compareText);
  if (files.length === 0) {
    const check = suggestedCommand("check", [], root);
    throw new InvalidArgument(`${path}'s source matches no file; ${check} names the entry to fix`);
  }
  const items = list(world, node);
  return {
    node: path,
    specFile: node.file,
    items,
    example: items.find((item) => item.kind === "requirement")?.ref ?? "purpose",
    files,
    uses: targets(world, node),
    drafts: world.placeholders.filter((placeholder) => placeholder.users.includes(spec.id)),
  };
}

/**
 * Both programs' first steps (R6): load the world from the project directory `root` (named from the cwd), find the
 * node at hierarchy path `node`, its scope. A path naming no node or a node that is not reviewable is an
 * InvalidArgument (exit 2); no world or a load failure is the load's own error (exit 1).
 */
export async function scopeAt(root: string, node: string): Promise<Scope> {
  const world = await loadWorld(root);
  return scope(root, world, findNode(world, node, root, "review"));
}
