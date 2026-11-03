/** A command as Cli knows it: help text, the check of its arguments, and the deferred call into its node. */
import type { Report } from "../shared/report.ts";

/** An option Cli parses: its spellings (the first is its name), the value it takes, and its help line. */
export interface Option {
  readonly names: readonly [string, ...string[]];
  readonly value: string;
  /** What a missing value needed: "--path needs a directory". */
  readonly needs: string;
  readonly text: string;
}

/** An option's value as typed: the spelling that named it (for messages) and the raw value, not yet judged. */
export interface OptionValue {
  readonly spelling: string;
  readonly raw: string;
}

/** The options Cli split off the arguments, each by its Option; an option not given has no entry. */
export type OptionValues = ReadonlyMap<Option, OptionValue>;

/** What a command runs once its arguments passed: the deferred call into its node, given the project directory. */
export interface Runner {
  run(root: string): Promise<Report>;
}

/** One command: what usage and its help show, and the check of its arguments that yields what it runs. */
export interface Cmd {
  readonly description: string;
  /** The argument part of its usage only, e.g. "[node] [-L <n>]"; Cli builds "nuhokai <name> …". */
  readonly args: string;
  /** The command's own options beside --path; Cli splits them off and its help lists them. */
  readonly options: readonly Option[];
  /**
   * Judge the values of its own options and its positionals, once Cli split the options off and turned away help,
   * unknown options and stray dash arguments: a usage error (exit 2), or the runner. The runner holds the deferred
   * import of the node, so help and usage never load one.
   */
  parse(values: OptionValues, positionals: readonly string[]): { error: string } | Runner;
}

/** The usage error for the first positional past the `max` a command takes, or none. */
export function extraArgument(positionals: readonly string[], max: number): { error: string } | undefined {
  const extra = positionals[max];
  return extra === undefined ? undefined : { error: `unexpected argument '${extra}'` };
}
