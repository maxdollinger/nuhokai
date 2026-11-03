/** A command as Cli knows it: help text, the arguments it takes, and the deferred call into its node. */
import type { Report } from "../shared/report.ts";

/**
 * An option Cli parses: its spellings (the first is its name), the value it takes, its help line, and the judge of
 * its value.
 */
export interface Option<T = unknown> {
  readonly names: readonly [string, ...string[]];
  readonly value: string;
  /** What a missing or bad value needed: "--path needs a directory". */
  readonly needs: string;
  readonly text: string;
  /** The value as typed → its typed value, or undefined if it is not one. */
  readonly parse: (raw: string) => T | undefined;
}

/** What Cli hands a command once its arguments passed: its positionals and its options' typed values. */
export interface Args {
  readonly positionals: readonly string[];
  /** An option's typed value, or undefined if it was not given. */
  get<T>(option: Option<T>): T | undefined;
}

/** A positional argument as a command's help explains it. */
export interface Argument {
  /** As its usage shows it, without brackets: "node". */
  readonly name: string;
  readonly text: string;
}

/** One command: what usage and its help show, the arguments Cli lets through, and what it runs. */
export interface Cmd {
  readonly description: string;
  /** Its positionals as usage shows them, e.g. ["[node]"]; their count is the most it takes. */
  readonly positionals: readonly string[];
  /** Each positional, explained: what to pass and its default. */
  readonly arguments: readonly Argument[];
  /** What it prints on stdout, with the shape of each line, so a reader can parse it without a trial run. */
  readonly output: string;
  /** The command's own options beside --path; Cli splits them off, judges their values and its help lists them. */
  readonly options: readonly Option[];
  /**
   * Run the command in the project directory, once Cli passed its arguments. It holds the deferred import of the
   * node, so help and usage never load one.
   */
  run(root: string, args: Args): Promise<Report>;
}
