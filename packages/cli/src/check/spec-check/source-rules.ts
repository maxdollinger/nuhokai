import type { Line, LoadedNode, LoadedWorld, SourcePlaces } from "../../load/load-world.ts";
import { type Finding, locate } from "../../shared/diagnostics.ts";
import { inWords } from "../../shared/failure.ts";
import { isAncestor } from "../../shared/node-path.ts";
import { type Expansion, ProjectFiles } from "../../shared/project-files.ts";
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

  /** SourceRules R3: the entries of a source that is a list, strings only; anything else is an error, never a crash. */
  const entriesOf = (owner: Owner, source: unknown): Entry[] | undefined => {
    if (!Array.isArray(source)) {
      const fix = 'make it a list of paths or globs, e.g. ["src/**"]';
      error(owner, `${owner.label}'s source is not a list`, fix, owner.source?.at);
      return undefined;
    }
    const entries: Entry[] = [];
    for (const [index, entry] of source.entries()) {
      const at = owner.source?.entries[index];
      if (typeof entry === "string") entries.push(at ? { text: entry, at } : { text: entry });
      else {
        const rule = `${owner.label}'s source lists ${inWords(entry)}, which is not a string`;
        error(owner, rule, "list paths or globs", at);
      }
    }
    return entries;
  };

  /** SourceRules R5: each directory an entry's walk could not read is an error at the entry; the rest still count. */
  const unreadable = (owner: Owner, entry: string, expansion: Expansion, where?: Line) => {
    for (const { dir, code } of "unreadable" in expansion ? expansion.unreadable : []) {
      error(
        owner,
        `${owner.node ? "" : "the world's "}source entry "${entry}" cannot read the directory ${dir} (${code})`,
        "make the directory readable, or narrow the entry so its files lie elsewhere",
        where,
      );
    }
  };

  // The world's source: inside the project directory, every entry matching a file (SpecCheck R10, R6).
  const worldOwner: Owner = {
    ...locate({ file: world.definedIn, line: world.line }),
    label: "the world",
    ...(world.sourcePlaces ? { source: world.sourcePlaces } : {}),
  };
  const worldEntries = entriesOf(worldOwner, world.source);
  // Files compare by their real path (SourceRules R6): a listing walks each directory once, under the first name that
  // reaches it, so a file the world lists as lib/a.ts is the src/lib/a.ts a node lists through a symlink.
  const real = (file: string) => project.realPath(file) ?? file;
  let covered: Set<string> | undefined;
  if (worldEntries) {
    covered = new Set();
    for (const { text: entry, at: where } of worldEntries) {
      const expansion = project.expand(entry);
      if ("refused" in expansion) {
        error(
          worldOwner,
          expansion.refused === "outside"
            ? `the world's source entry "${entry}" lies outside the project directory`
            : `the world's source entry "${entry}" has a .. segment`,
          "list only paths inside the project directory, without .., or run check with --path at the directory holding the code",
          where,
        );
        continue;
      }
      unreadable(worldOwner, entry, expansion, where);
      if (!expansion.files.length && !expansion.unreadable.length) {
        error(
          worldOwner,
          `the world's source entry "${entry}" matches no file`,
          "fix the path or glob, or drop the entry",
          where,
        );
      }
      for (const file of expansion.files) covered.add(real(file));
    }
  }

  // Each node's source (SpecCheck R6, R10); the files it matches feed the ownership rule (SpecCheck R7).
  /** Each file's claims by real path: the node, and the name it lists the file by. */
  const owners = new Map<string, { node: LoadedNode; file: string }[]>();
  for (const node of world.nodes) {
    if (ids.duplicated.has(node.spec.id)) continue;
    const owner: Owner = {
      node,
      ...locate(node),
      label: node.spec.name,
      ...(node.source ? { source: node.source } : {}),
    };
    const entries = entriesOf(owner, (node.spec as { source?: unknown }).source);
    for (const { text: entry, at: where } of entries ?? []) {
      const expansion = project.expand(entry);
      if ("refused" in expansion) {
        error(
          owner,
          expansion.refused === "outside"
            ? `source entry "${entry}" lies outside the project directory, so outside the world's source`
            : `source entry "${entry}" has a .. segment`,
          "list only paths inside the world's source, without ..",
          where,
        );
        continue;
      }
      unreadable(owner, entry, expansion, where);
      if (!expansion.files.length) {
        if (!expansion.unreadable.length) {
          error(owner, `source entry "${entry}" matches no file`, "fix the path or glob, or drop the entry", where);
        }
        continue;
      }
      const uncovered = covered && expansion.files.find((file) => !covered.has(real(file)));
      if (uncovered !== undefined) {
        error(
          owner,
          `source entry "${entry}" matches ${uncovered}, which is not under the world's source`,
          `narrow the entry to the world's source, or add the file to the world's source in ${world.definedIn}`,
          where,
        );
      }
      for (const file of expansion.files) {
        const claimed = owners.get(real(file)) ?? [];
        if (!claimed.some((claim) => claim.node === node)) claimed.push({ node, file });
        owners.set(real(file), claimed);
      }
    }
  }

  // SpecCheck R7: one owner per file, unless one owner is the other's ancestor; a file listed under two names (through
  // a symlink) names both.
  for (const claimed of owners.values()) {
    for (const [index, claim] of claimed.entries()) {
      for (const otherClaim of claimed.slice(0, index)) {
        const { node } = claim;
        const other = otherClaim.node;
        if (isAncestor(world, other, node) || isAncestor(world, node, other)) continue;
        const [first, second] = other.index < node.index ? [otherClaim, claim] : [claim, otherClaim];
        const as = first.file === second.file ? "" : `, as ${first.file}`;
        error(
          { node: second.node, ...locate(second.node), label: second.node.spec.name },
          `${second.file} is in the source of both ${first.node.path} (${first.node.file}${as}) and ${second.node.path}`,
          "keep the file in one node's source, or move the shared code into a node of its own",
        );
      }
    }
  }
  return findings;
}
