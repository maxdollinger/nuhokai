/** A command as Cli knows it: help text, its own argument parser and the deferred call into its node. */
import type { Report } from "../shared/report.ts";

/** An option Cli parses: its spellings (the first is its name), the value it takes, and its help line. */
export interface Option {
  readonly names: readonly [string, ...string[]];
  readonly value: string;
  /** What a missing value needed: "--path needs a directory". */
  readonly needs: string;
  readonly text: string;
}

/** One command: what usage and its help show, how its arguments parse, and how it runs. */
export interface Cmd<A> {
  readonly description: string;
  /** The argument form usage shows: "nuhokai tree [node] [-L <n>]". */
  readonly synopsis: string;
  /** The command's own options beside --path; its help lists them. */
  readonly options: readonly Option[];
  /** This command's remaining arguments (after Cli split --path and help) → typed args, or a usage error (exit 2). */
  parse(args: readonly string[]): A | { error: string };
  /** Run the command; its deferred import of the node lives here, so help and usage never load one. */
  exec(root: string, args: A): Promise<Report>;
}

/** Identity helper that ties parse's output type to exec's input type. */
export const cmd = <A>(c: Cmd<A>): Cmd<A> => c;

/** After a command only the flags are help, so `nuhokai tree help` starts from a node named help. */
const HELP_FLAGS = ["--help", "-h"] as const;

export function isHelpFlag(value: string): boolean {
  return (HELP_FLAGS as readonly string[]).includes(value);
}

/** Whether parse answered a usage error rather than the command's arguments. */
export function isUsageError(parsed: unknown): parsed is { error: string } {
  return typeof parsed === "object" && parsed !== null && "error" in parsed;
}

/**
 * Split one option off the arguments, touching nothing else: `--name <value>`, `--name=<value>` for a long name,
 * or a short name and its value. A missing value (a help flag included) or a second occurrence is the
 * invocation's fault, so it is a message naming the spelling typed, never a command run. The value itself is the
 * caller's to judge, after help.
 */
export function splitOption(
  args: readonly string[],
  option: Option,
): { value?: { spelling: string; raw: string }; rest: string[] } | { error: string } {
  let value: { spelling: string; raw: string } | undefined;
  const rest: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    const spelling = option.names.find((name) => arg === name || (name.startsWith("--") && arg.startsWith(`${name}=`)));
    if (spelling === undefined) {
      rest.push(arg);
      continue;
    }
    if (value !== undefined) return { error: `${spelling} given twice` };
    const raw = arg === spelling ? args[++index] : arg.slice(spelling.length + 1);
    if (!raw || isHelpFlag(raw)) return { error: `${spelling} needs ${option.needs}` };
    value = { spelling, raw };
  }
  return value === undefined ? { rest } : { value, rest };
}

/**
 * Whether the arguments ask for the command's help: with its options split off, one help flag is all that is left.
 * A value is not judged here, so help wins over a bad one; a missing value or a repeat is no help request.
 */
export function asksHelp(args: readonly string[], options: readonly Option[]): boolean {
  let rest = args;
  for (const option of options) {
    const split = splitOption(rest, option);
    if ("error" in split) return false;
    rest = split.rest;
  }
  return rest.length === 1 && isHelpFlag(rest[0] ?? "");
}

/**
 * What is left once a command split its options off, as a usage error or none: a help flag beside other arguments
 * is unexpected, any other dash argument a mistyped or unknown option, and past `max` positionals the first extra
 * is unexpected. The positionals themselves pass unchanged, never validated.
 */
export function leftovers(rest: readonly string[], max: number): { error: string } | undefined {
  const helpFlag = rest.find(isHelpFlag);
  if (helpFlag !== undefined) return { error: `unexpected argument '${helpFlag}'` };
  const option = rest.find((value) => value.startsWith("-"));
  if (option !== undefined) return { error: `unknown option '${option}'` };
  if (rest.length > max) return { error: `unexpected argument '${rest[max]}'` };
  return undefined;
}

/** parse for a command that takes no argument and no option of its own. */
export function noArguments(args: readonly string[]): { error: string } | undefined {
  return leftovers(args, 0);
}
