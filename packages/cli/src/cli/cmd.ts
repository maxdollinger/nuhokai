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
 * What Cli hands a command once its arguments passed: its positionals, its options' typed values, and stdin's text
 * when its stdin flag was given.
 */
export interface Args {
  readonly positionals: readonly string[];
  /** An option's typed value, or undefined if it was not given. */
  get<T>(option: Option<T>): T | undefined;
  /** Stdin's text, read by Cli: present exactly when the command's stdin flag was given. */
  readonly stdin?: string;
}

/** A positional argument as a command's help explains it. */
export interface Argument {
  /** Its name, without brackets: "node". Usage shows it as `<node>` when required, else `[node]`. */
  readonly name: string;
  /** Whether usage shows it as one to give (`<node>`) or one to leave out (`[node]`); the command judges its absence. */
  readonly required: boolean;
  readonly text: string;
}

/** One command: what usage and its help show, the arguments Cli lets through, and what it runs. */
export interface Cmd {
  readonly description: string;
  /** Its positionals in order, each explained; their count is the most it takes. */
  readonly arguments: readonly Argument[];
  /** What it prints on stdout, with the shape of each line, so a reader can parse it without a trial run. */
  readonly output: string;
  /** The command's own options beside --path; Cli splits them off, judges their values and its help lists them. */
  readonly options: readonly Option[];
  /**
   * The flag that makes Cli read stdin and hand its text over as `stdin`, in place of the positionals: one of the two
   * is required, never both. Never from a terminal, nor empty or silent past Cli's wait, so an unattended run ends.
   * Help lists it with the options; only Cli reads stdin.
   */
  readonly stdinFlag?: Flag;
  /**
   * Run the command in the project directory, once Cli passed its arguments. It holds the deferred import of the
   * node, so help and usage never load one.
   */
  run(root: string, args: Args): Promise<Report>;
}
