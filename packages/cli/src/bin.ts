#!/usr/bin/env -S bun --no-install

import { statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { asksHelp, type Cmd, isUsageError, type Option, splitOption } from "./cli/cmd.ts";
import { checkCmd } from "./cli/commands/check.ts";
import { initCmd } from "./cli/commands/init.ts";
import { mapCmd } from "./cli/commands/map.ts";
import { treeCmd } from "./cli/commands/tree.ts";
import { updateCmd } from "./cli/commands/update.ts";
import { CutShort, type Outcome, type Report, type ReportLine } from "./shared/report.ts";

/** The commands the CLI exposes, in usage's order; `update` is planned, `check`, `init`, `map` and `tree` run today. */
export const COMMANDS = {
  check: checkCmd,
  init: initCmd,
  map: mapCmd,
  tree: treeCmd,
  update: updateCmd,
} satisfies Record<string, Cmd<unknown>>;

export type Command = keyof typeof COMMANDS;

/** Cli alone turns a command's outcome into the process exit code; 2 is also every usage error of its own. */
const EXIT: Record<Outcome, number> = { ok: 0, failed: 1, invalid: 2 };

/** Help before a command; after one only the flags are help (Cmd's isHelpFlag), so `nuhokai tree help` names a node. */
const HELP_WORDS = ["help", "--help", "-h"] as const;

/** The one option every command takes: the project directory holding nuhokai/, instead of the cwd. */
const PATH_OPTION: Option = {
  names: ["--path"],
  value: "<dir>",
  needs: "a directory",
  text: "the project directory holding nuhokai/ (default: the current directory)",
};

const NAMES = Object.keys(COMMANDS) as Command[];

/** The synopsis column's width, so every description starts in one column. */
const SYNOPSIS_WIDTH = Math.max(...NAMES.map((name) => COMMANDS[name].synopsis.length)) + 2;

export function usage(): string {
  return [
    "nuhokai — the world format toolchain",
    "",
    "Usage: nuhokai <command> [--path <dir>] [arguments]",
    "",
    "Commands:",
    ...NAMES.map((name) => `  ${COMMANDS[name].synopsis.padEnd(SYNOPSIS_WIDTH)}${COMMANDS[name].description}`),
    "",
    "Run `nuhokai <command> --help` for command options.",
  ].join("\n");
}

/** One help text per command, answered by Cli before parse: the command's own options, --path and --help. */
export function commandUsage(command: Command): string {
  const { description, synopsis, options } = COMMANDS[command];
  const lines: (readonly [string, string])[] = [
    ...[...options, PATH_OPTION].map((option): [string, string] => [
      `${[...option.names].sort((a, b) => a.length - b.length).join(", ")} ${option.value}`,
      option.text,
    ]),
    ["--help", "show this help"],
  ];
  const width = Math.max(...lines.map(([flags]) => flags.length)) + 2;
  return [
    `nuhokai ${command} — ${description}`,
    "",
    `Usage: ${synopsis}`,
    "",
    "Options:",
    ...lines.map(([flags, text]) => `  ${flags.padEnd(width)}${text}`),
  ].join("\n");
}

function isHelpWord(value: string): boolean {
  return (HELP_WORDS as readonly string[]).includes(value);
}

function isCommand(value: string): value is Command {
  return Object.hasOwn(COMMANDS, value);
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
function usageError(command: Command, error: string): number {
  console.error(`nuhokai ${command}: ${error}\n\n${commandUsage(command)}`);
  return 2;
}

/** Resolves to the process exit code: 0 ok, 1 diagnostics or failure, 2 usage or argument error. */
export async function main(argv: readonly string[]): Promise<number> {
  const [first, ...args] = argv;
  if (first === undefined || isHelpWord(first)) {
    console.log(usage());
    return 0;
  }
  if (!isCommand(first)) {
    console.error(`nuhokai: unknown command '${first}'\n\n${usage()}`);
    return 2;
  }
  const command: Cmd<unknown> = COMMANDS[first];
  const path = splitOption(args, PATH_OPTION);
  if ("error" in path) return usageError(first, path.error);
  // Help wins over any value, a bad --path included; the command's options are only split off to find it.
  if (asksHelp(path.rest, command.options)) {
    console.log(commandUsage(first));
    return 0;
  }
  const parsed = command.parse(path.rest);
  if (isUsageError(parsed)) return usageError(first, parsed.error);
  // The project directory is --path against the cwd, else the cwd itself.
  const cwd = process.cwd();
  const named = path.value?.raw ?? ".";
  const dir = resolve(cwd, named);
  if (!isDirectory(dir)) return usageError(first, `not a directory: ${named}`);
  // Commands get the directory as named from the cwd, so every path they print opens as printed.
  const root = relative(cwd, dir).split(sep).join("/") || ".";
  return finish(first, command.exec(root, parsed));
}

/** Print the command's Report and map its outcome to the exit code; a bug crashes, after the lines answered before it. */
async function finish(command: Command, running: Promise<Report>): Promise<number> {
  let report: Report;
  try {
    report = await running;
  } catch (error) {
    if (!(error instanceof CutShort)) throw error;
    print(command, error.lines);
    throw error.bug;
  }
  print(command, report.lines);
  return EXIT[report.outcome];
}

/** A run of control characters (escape sequences, carriage returns, newlines): one space, so none reaches the terminal. */
const CONTROL = /\p{Cc}+/gu;

/**
 * Cli is the only node that prints: result lines on stdout, failure lines on stderr after its prefix, in order, each
 * one plain line whatever the command put in it (Terminal R1).
 */
function print(command: Command, lines: readonly ReportLine[]): void {
  for (const line of lines) {
    const text = line.text.replace(CONTROL, " ");
    if (line.kind === "result") console.log(text);
    else console.error(`nuhokai ${command}: ${text}`);
  }
}

if (import.meta.main) {
  process.exitCode = await main(Bun.argv.slice(2));
}
