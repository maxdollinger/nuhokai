import type { Line, LoadedNode, LoadedWorld, SourcePlaces } from "../../load/load-world.ts";
import { type Finding, locate } from "../../shared/diagnostics.ts";
import { isAncestor } from "../../shared/node-path.ts";
import { ProjectFiles } from "../../shared/project-files.ts";
import type { Ids } from "./ids.ts";

/** A node or the world, as a source's owner: where its findings point and how they name it. */
interface Owner {
  readonly node?: LoadedNode;
  readonly file: string;
  readonly line?: number;
  readonly label: string;
  /** Where its source and each entry were written: a finding about one points there, else at the owner. */
  readonly source?: SourcePlaces;
}

/** One string entry of a source, with where it was written when known. */
interface Entry {
  readonly text: string;
  readonly at?: Line;
}

/**
 * The source rules (SpecCheck R6, R7, R10): every entry exists, every node's files lie under the world's source, and
 * each file has one owner, nesting aside. Reads the project directory `root`, named from the cwd; every glob shares one
 * set of directory reads.
 */
export function checkSourceRules(root: string, world: LoadedWorld, ids: Ids): Finding[] {
  const project = new ProjectFiles(root);
  const findings: Finding[] = [];
  const error = (owner: Owner, rule: string, fix: string, where?: Line) =>
    findings.push({
      severity: "error",
      ...locate({ file: owner.file, line: (where ?? owner).line }),
      ...(owner.node ? { node: owner.node.path } : {}),
      rule,
      fix,
    });

  /** A source's entries, each with where it was written when known: LoadWorld already made each a string (R16). */
  const entriesOf = (owner: Owner, source: readonly string[]): Entry[] =>
    source.map((text, index) => {
      const at = owner.source?.entries[index];
      return at ? { text, at } : { text };
    });

  /**
   * One entry's files, as ProjectFiles.expand finds them (SourceRules R1), for the world and a node alike: one outside
   * the project directory is an error and matches nothing (SpecCheck R10), one matching no file an error (SpecCheck R6).
   */
  const filesOf = (owner: Owner, entry: string, where?: Line): readonly string[] => {
    const named = `${owner.node ? "" : "the world's "}source entry "${entry}"`;
    const files = project.expand(entry);
    if (files === undefined) {
      const why = `lies outside the project directory${owner.node ? ", so outside the world's source" : ""}`;
      const fix = owner.node
        ? "list only paths inside the world's source"
        : "list only paths inside the project directory, or run check with --path at the directory holding the code";
      error(owner, `${named} ${why}`, fix, where);
      return [];
    }
    if (files.length) return files;
    if (project.isDirectory(entry)) {
      const glob = `${entry.replace(/\/+$/, "")}/**`;
      error(owner, `${named} is a directory, not a file`, `write "${glob}" for the files below it`, where);
    } else error(owner, `${named} matches no file`, "fix the path or glob, or drop the entry", where);
    return files;
  };

  // The world's source (SpecCheck R10, R6).
  const worldOwner: Owner = {
    ...locate({ file: world.definedIn, line: world.line }),
    label: "the world",
    ...(world.sourcePlaces ? { source: world.sourcePlaces } : {}),
  };
  // A world without a source list has its problem from LoadWorld, and covers nothing to judge nodes against.
  const covered =
    world.source &&
    new Set(entriesOf(worldOwner, world.source).flatMap(({ text, at }) => filesOf(worldOwner, text, at)));

  // Each node's source (SpecCheck R6, R10); the files it matches feed the ownership rule (SpecCheck R7).
  const owners = new Map<string, LoadedNode[]>();
  for (const node of world.nodes) {
    if (ids.duplicated.has(node.spec.id)) continue;
    const owner: Owner = {
      node,
      ...locate(node),
      label: node.spec.name,
      ...(node.source ? { source: node.source } : {}),
    };
    for (const { text: entry, at: where } of entriesOf(owner, node.spec.source)) {
      const files = filesOf(owner, entry, where);
      const uncovered = covered && files.find((file) => !covered.has(file));
      if (uncovered !== undefined) {
        error(
          owner,
          `source entry "${entry}" matches ${uncovered}, which is not under the world's source`,
          `narrow the entry to the world's source, or add the file to the world's source in ${world.definedIn}`,
          where,
        );
      }
      for (const file of files) {
        const claimed = owners.get(file) ?? [];
        if (!claimed.includes(node)) claimed.push(node);
        owners.set(file, claimed);
      }
    }
  }

  // SpecCheck R7: one owner per file, unless one owner is the other's ancestor.
  for (const [file, claimed] of owners) {
    for (const [index, node] of claimed.entries()) {
      for (const other of claimed.slice(0, index)) {
        if (isAncestor(world, other, node) || isAncestor(world, node, other)) continue;
        const [first, second] = other.index < node.index ? [other, node] : [node, other];
        error(
          { node: second, ...locate(second), label: second.spec.name },
          `${file} is in the source of both ${first.path} (${first.file}) and ${second.path}`,
          "keep the file in one node's source, or move the shared code into a node of its own",
        );
      }
    }
  }
  return findings;
}
