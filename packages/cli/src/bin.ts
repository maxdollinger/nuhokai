#!/usr/bin/env -S bun --no-install

import { statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { Args, Cmd, Option } from "./cli/cmd.ts";
import { checkCmd } from "./cli/commands/check.ts";
import { initCmd } from "./cli/commands/init.ts";
import { mapCmd } from "./cli/commands/map.ts";
import { treeCmd } from "./cli/commands/tree.ts";
import { updateCmd } from "./cli/commands/update.ts";
import { plainText } from "./shared/failure.ts";
import { CutShort, type Outcome, type Report, type ReportLine } from "./shared/report.ts";

/** The commands by name, in usage's order. */
type Commands = Readonly<Record<string, Cmd>>;

/** Cli alone turns a command's outcome into the process exit code; 2 is also every usage error of its own. */
const EXIT: Record<Outcome, number> = { ok: 0, failed: 1, invalid: 2 };

/** After a command only the flags are help, so `nuhokai tree help` starts from a node named help. */
const HELP_FLAGS = ["--help", "-h"];

/** Before a command the word is help too. */
const HELP_WORDS = ["help", ...HELP_FLAGS];

/** The one option every command takes: the project directory holding nuhokai/, instead of the cwd. */
const PATH_OPTION: Option<string> = {
  names: ["--path"],
  value: "<dir>",
  needs: "a directory",
  text: "the project directory holding nuhokai/ (default: the current directory)",
  // Any value names a path; whether it is a directory is judged last, before the command runs.
  parse: (raw) => raw,
};

/** An option's value as typed: the spelling that named it (for messages) and the raw value, not yet judged. */
interface OptionValue {
  readonly spelling: string;
  readonly raw: string;
}

/** An option's spellings, shortest first: "-L, --level". */
function spellings(option: Option): string[] {
  return [...option.names].sort((a, b) => a.length - b.length);
}

/** A command's argument form, from its positionals and its own options: "nuhokai tree [node] [-L <n>]". */
function synopsis(name: string, { positionals, options }: Cmd): string {
  const optional = options.map((option) => `[${spellings(option)[0]} ${option.value}]`);
  return ["nuhokai", name, ...positionals, ...optional].join(" ");
}

function usage(commands: Commands): string {
  const synopses = Object.entries(commands).map(([name, cmd]) => [synopsis(name, cmd), cmd.description] as const);
  // The synopsis column's width, so every description starts in one column.
  const width = Math.max(...synopses.map(([form]) => form.length)) + 2;
  return [
    "nuhokai — the world format toolchain",
    "",
    "Usage: nuhokai <command> [--path <dir>] [arguments]",
    "",
    "Commands:",
    ...synopses.map(([form, description]) => `  ${form.padEnd(width)}${description}`),
    "",
    "Run `nuhokai <command> --help` for command options.",
  ].join("\n");
}

/** One help text per command, answered by Cli before any value is judged: its own options, --path and --help. */
function commandUsage(name: string, cmd: Cmd): string {
  const { description, options } = cmd;
  const lines: (readonly [string, string])[] = [
    ...[...options, PATH_OPTION].map((option): [string, string] => [
      `${spellings(option).join(", ")} ${option.value}`,
      option.text,
    ]),
    ["--help", "show this help"],
  ];
  const width = Math.max(...lines.map(([flags]) => flags.length)) + 2;
  return [
    `nuhokai ${name} — ${description}`,
    "",
    `Usage: ${synopsis(name, cmd)}`,
    "",
    "Options:",
    ...lines.map(([flags, text]) => `  ${flags.padEnd(width)}${text}`),
  ].join("\n");
}

function isHelpFlag(value: string): boolean {
  return HELP_FLAGS.includes(value);
}

/**
 * Split one option off the arguments, touching nothing else: `--name <value>`, `--name=<value>` for a long name,
 * or a short name and its value. A missing value (a help flag included) or a second occurrence is the
 * invocation's fault, so it is a message naming the spelling typed, never a command run. The value itself is the
 * option's parse to judge, after help.
 */
function splitOption(
  args: readonly string[],
  option: Option,
): { value?: OptionValue; rest: string[] } | { error: string } {
  let value: OptionValue | undefined;
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

/** Split each option off in turn, so the first one's errors come first; what is left is `rest`. */
function splitOptions(
  args: readonly string[],
  options: readonly Option[],
): { values: ReadonlyMap<Option, OptionValue>; rest: readonly string[] } | { error: string } {
  const values = new Map<Option, OptionValue>();
  let rest = args;
  for (const option of options) {
    const split = splitOption(rest, option);
    if ("error" in split) return split;
    if (split.value) values.set(option, split.value);
    rest = split.rest;
  }
  return { values, rest };
}

/**
 * What is left once the options are split off, as a usage error or none: a help flag beside other arguments is
 * unexpected, and any other dash argument a mistyped or unknown option. The positionals are counted after it.
 */
function strayArgument(rest: readonly string[]): { error: string } | undefined {
  const helpFlag = rest.find(isHelpFlag);
  if (helpFlag !== undefined) return { error: `unexpected argument '${helpFlag}'` };
  const option = rest.find((value) => value.startsWith("-"));
  if (option !== undefined) return { error: `unknown option '${option}'` };
  return undefined;
}

/** Whether `dir` is a directory; a path through a file or an unreadable one is not, whatever stat throws. */
function isDirectory(dir: string): boolean {
  try {
    return statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
}

/** A usage error of one command: its message, then its help, on stderr; exit 2. */
function usageError(name: string, cmd: Cmd, error: string): number {
  console.error(`nuhokai ${name}: ${plainText(error)}\n\n${commandUsage(name, cmd)}`);
  return 2;
}

/** Resolves to the process exit code: 0 ok, 1 diagnostics or failure, 2 usage or argument error. */
export async function main(argv: readonly string[]): Promise<number> {
  // The commands the CLI exposes, in usage's order; `update` is planned, the others run today.
  const commands: Commands = {
    check: checkCmd,
    init: initCmd,
    map: mapCmd,
    tree: treeCmd,
    update: updateCmd,
  };
  const [first, ...typed] = argv;
  if (first === undefined || HELP_WORDS.includes(first)) {
    console.log(usage(commands));
    return 0;
  }
  const cmd = Object.hasOwn(commands, first) ? commands[first] : undefined;
  if (cmd === undefined) {
    console.error(`nuhokai: unknown command '${plainText(first)}'\n\n${usage(commands)}`);
    return 2;
  }
  const split = splitOptions(typed, [PATH_OPTION, ...cmd.options]);
  if ("error" in split) return usageError(first, cmd, split.error);
  // Help wins over any value, a bad --path included: values are judged only after it.
  if (split.rest.length === 1 && isHelpFlag(split.rest[0] ?? "")) {
    console.log(commandUsage(first, cmd));
    return 0;
  }
  const stray = strayArgument(split.rest);
  if (stray) return usageError(first, cmd, stray.error);
  // The count before any value: the first positional past the command's declared ones is named.
  const extra = split.rest[cmd.positionals.length];
  if (extra !== undefined) return usageError(first, cmd, `unexpected argument '${extra}'`);
  const values = new Map<Option, unknown>();
  for (const [option, { spelling, raw }] of split.values) {
    const value = option.parse(raw);
    if (value === undefined) return usageError(first, cmd, `${spelling} needs ${option.needs}, got '${raw}'`);
    values.set(option, value);
  }
  const args: Args = {
    positionals: split.rest,
    // A closure, not a method, so a command may destructure it; each value is its own option's parse result.
    get: <T>(option: Option<T>) => values.get(option) as T | undefined,
  };
  // The project directory is --path against the cwd, else the cwd itself.
  const cwd = process.cwd();
  const named = args.get(PATH_OPTION) ?? ".";
  const dir = resolve(cwd, named);
  if (!isDirectory(dir)) return usageError(first, cmd, `not a directory: ${named}`);
  // Commands get the directory as named from the cwd, so every path they print opens as printed.
  const root = relative(cwd, dir).split(sep).join("/") || ".";
  return finish(first, cmd, root, args);
}

/**
 * Run the command, print its Report and map its outcome to the exit code; a bug crashes, after the lines answered
 * before it, whether run throws or rejects.
 */
async function finish(name: string, cmd: Cmd, root: string, args: Args): Promise<number> {
  let report: Report;
  try {
    report = await cmd.run(root, args);
  } catch (error) {
    if (!(error instanceof CutShort)) throw error;
    print(name, error.lines);
    throw error.bug;
  }
  print(name, report.lines);
  return EXIT[report.outcome];
}

/**
 * Cli is the only node that prints: result lines on stdout, failure lines on stderr after its prefix, in order, each
 * one plain line whatever the command put in it (Terminal R1).
 */
function print(name: string, lines: readonly ReportLine[]): void {
  for (const line of lines) {
    const text = plainText(line.text);
    if (line.kind === "result") console.log(text);
    else console.error(`nuhokai ${name}: ${text}`);
  }
}

if (import.meta.main) {
  process.exitCode = await main(Bun.argv.slice(2));
}
