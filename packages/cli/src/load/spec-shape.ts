/**
 * The one judge of the shape of a spec's data fields (LoadWorld R16): a world that loads gets fields of the types its
 * NodeSpec says, so no consumer re-checks them. A field of the wrong shape is replaced (a list by the items it can
 * keep, a text by ""), and each replacement is one problem: an error finding at the field or item that broke it.
 * Pure: judges only the values it is given.
 */
import { type Finding, locate } from "../shared/diagnostics.ts";
import { inWords } from "../shared/failure.ts";
import type { SourcePlaces } from "./reader.ts";

/** Whose fields are judged: where its problems point when a field's own line is not known, and how they name it. */
export interface Owner {
  readonly file: string;
  readonly line?: number | undefined;
  /** The node's path, as a finding names it; absent for the world. */
  readonly node?: string;
  /** How a rule names the owner: the node's name, or "the world". */
  readonly label: string;
}

/** A list of the items kept, with the line each was written on, in the same order. */
export interface Kept<T> {
  readonly items: T[];
  readonly lines: (number | undefined)[];
}

/** Collects the problems of one owner's fields, each at its own line when known, else at the owner's. */
export class SpecShape {
  readonly problems: Finding[] = [];

  constructor(private readonly owner: Owner) {}

  private problem(rule: string, fix: string, line: number | undefined): void {
    const { file, node } = this.owner;
    this.problems.push({
      severity: "error",
      ...locate({ file, line: line ?? this.owner.line }),
      ...(node === undefined ? {} : { node }),
      rule,
      fix,
    });
  }

  /**
   * A source as a list of strings, with where each kept entry was written. Undefined, with a problem, when it is no
   * list (a missing one included); an entry that is no string is dropped, with a problem at it.
   */
  source(value: unknown, places: SourcePlaces | undefined): { source: string[]; places?: SourcePlaces } | undefined {
    const { label } = this.owner;
    if (!Array.isArray(value)) {
      this.problem(
        `${label}'s source is not a list`,
        'make it a list of paths or globs, e.g. ["src/**"]',
        places?.at?.line,
      );
      return undefined;
    }
    const kept = this.keep(
      value,
      (index) => places?.entries[index]?.line,
      (entry): entry is string => {
        return typeof entry === "string";
      },
      (entry) => [`${label}'s source lists ${inWords(entry)}, which is not a string`, "list paths or globs"],
    );
    if (places === undefined) return { source: kept.items };
    const entries = kept.lines.map((line) => (line === undefined ? undefined : { line }));
    return { source: kept.items, places: places.at ? { at: places.at, entries } : { entries } };
  }

  /** A text field: the string, else "" with a problem at the field. */
  text(field: string, value: unknown, line: number | undefined, fix: string): string {
    if (typeof value === "string") return value;
    this.problem(`${field} ${value === undefined ? "is missing" : `is ${inWords(value)}`}, not a string`, fix, line);
    return "";
  }

  /**
   * An optional list of objects: undefined when absent; a value that is no list is dropped, with a problem at the
   * field; an item that is no object is dropped, with a problem at it. `itemLine` gives the line of an item, for its
   * problem; the items kept are the very objects given, so whatever is known of them by identity stays true.
   */
  objects(
    field: string,
    value: unknown,
    line: number | undefined,
    itemLine: (index: number) => number | undefined,
  ): Record<string, unknown>[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      this.problem(`${field} is not a list`, `make ${field} a list of objects, or drop it`, line);
      return undefined;
    }
    return this.keep(
      value,
      itemLine,
      (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
      (_item, index) => [`${field}[${index}] is not an object`, `make it an object, or drop it from ${field}`],
    ).items;
  }

  /** The items `is` keeps, with their lines; one problem for each item dropped. */
  private keep<T>(
    list: readonly unknown[],
    itemLine: (index: number) => number | undefined,
    is: (item: unknown) => item is T,
    why: (item: unknown, index: number) => [rule: string, fix: string],
  ): Kept<T> {
    const kept: Kept<T> = { items: [], lines: [] };
    for (const [index, item] of list.entries()) {
      if (is(item)) {
        kept.items.push(item);
        kept.lines.push(itemLine(index));
      } else this.problem(...why(item, index), itemLine(index));
    }
    return kept;
  }
}
