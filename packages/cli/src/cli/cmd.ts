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

/** An option without a value, such as review's --submit: given or not. `--submit=x` is a usage error. */
export interface Flag {
  readonly names: readonly [string, ...string[]];
  readonly flag: true;
  readonly text: string;
}

/**
 * What Cli hands a command once its arguments passed: its positionals, its options' typed values and its flags, and
 * stdin's text when the command's input flag was given.
 */
export interface Args {
  readonly positionals: readonly string[];
  /** An option's typed value, or undefined if it was not given. */
  get<T>(option: Option<T>): T | undefined;
  /** Whether a flag was given. */
  has(flag: Flag): boolean;
  /** Stdin's text, read to its end by Cli: only when the command's `input` flag was given. */
  readonly input?: string;
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
  /** The command's own options and flags beside --path; Cli splits them off, judges their values and its help lists them. */
  readonly options: readonly (Option | Flag)[];
  /**
   * The flag that makes Cli read stdin to its end and hand the text over as `input`, and what that text is ("the
   * review JSON"): never from a terminal, never empty, so the command never waits. Only Cli reads stdin.
   */
  readonly input?: { readonly flag: Flag; readonly what: string };
  /** More of its help, after Output: how the command is used, line by line. */
  readonly notes?: readonly string[];
  /**
   * The command's own usage error once the count passed and the values are judged, such as two arguments that exclude
   * each other: its message, or undefined when the arguments go together.
   */
  misuse?(args: Args): string | undefined;
  /**
   * Run the command in the project directory, once Cli passed its arguments. It holds the deferred import of the
   * node, so help and usage never load one.
   */
  run(root: string, args: Args): Promise<Report>;
}
