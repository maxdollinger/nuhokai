#!/usr/bin/env -S bun --no-install

import { statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { runInit } from "./init/index.ts";
import { runNew } from "./new/index.ts";

/** The commands the CLI exposes; `update` is planned, `check`, `init`, `map`, `new` and `tree` run today. */
export const COMMANDS = ["check", "init", "map", "new", "tree", "update"] as const;

export type Command = (typeof COMMANDS)[number];

const DESCRIPTIONS: Record<Command, string> = {
  check: "Load the world, run tsc and the global rules, print one diagnostics list",
  init: "Write the world skeleton, the CLI-owned tsconfig and the @nuhokai/world types",
  map: "Draw the world into nuhokai/.generated/map.html, a self-contained 3D map",
  new: "Add one node file with a fresh id and TODO placeholders to an existing world",
  tree: "Print the node hierarchy, one line per node: path | source | purpose",
  update: "Refresh the CLI-owned tsconfig and the @nuhokai/world types of an existing world",
};

/** The argument form each command takes; usage shows it, Cli enforces the count and nothing else. */
const SYNOPSIS: Record<Command, string> = {
  check: "nuhokai check",
  init: "nuhokai init",
  map: "nuhokai map",
  new: "nuhokai new <node-path>",
  tree: "nuhokai tree [node] [-L <n>]",
  update: "nuhokai update",
};

/** How many positional arguments each command takes, at least and at most; the value is the command's to validate. */
const ARITY: Record<Command, readonly [min: number, max: number]> = {
  check: [0, 0],
  init: [0, 0],
  map: [0, 0],
  new: [1, 1],
  tree: [0, 1],
  update: [0, 0],
};

/** Help before a command; after one only the flags are help, so `nuhokai new help` adds nuhokai/help.ts. */
const HELP_WORDS = ["help", "--help", "-h"] as const;
const HELP_FLAGS = ["--help", "-h"] as const;

/** The one flag every command takes: the project directory holding nuhokai/, instead of the cwd. */
const PATH_FLAG = "--path";

/** tree's own option: how many levels below the start to print; 0 = all. */
const LEVEL_FLAG = "--level";
const LEVEL_SHORT = "-L";
const DEFAULT_LEVEL = 1;

/** Each command's own options, as its help lists them; Cli parses them all. */
const OPTIONS: Partial<Record<Command, readonly [flags: string, text: string][]>> = {
  tree: [[`${LEVEL_SHORT}, ${LEVEL_FLAG} <n>`, `levels below the start to print; 0 = all (default: ${DEFAULT_LEVEL})`]],
};

/** The synopsis column's width, so every description starts in one column. */
const SYNOPSIS_WIDTH = Math.max(...COMMANDS.map((command) => SYNOPSIS[command].length)) + 2;

export function usage(): string {
  return [
    "nuhokai — the world format toolchain",
    "",
    "Usage: nuhokai <command> [--path <dir>] [arguments]",
    "",
    "Commands:",
    ...COMMANDS.map((command) => `  ${SYNOPSIS[command].padEnd(SYNOPSIS_WIDTH)}${DESCRIPTIONS[command]}`),
    "",
    "Run `nuhokai <command> --help` for command options.",
  ].join("\n");
}

/** One help text per command, answered by Cli before dispatch; commands stay flag-free, Cli owns every option. */
export function commandUsage(command: Command): string {
  const options: (readonly [string, string])[] = [
    ...(OPTIONS[command] ?? []),
    ["--path <dir>", "the project directory holding nuhokai/ (default: the current directory)"],
    ["--help", "show this help"],
  ];
  const width = Math.max(...options.map(([flags]) => flags.length)) + 2;
  return [
    `nuhokai ${command} — ${DESCRIPTIONS[command]}`,
    "",
    `Usage: ${SYNOPSIS[command]}`,
    "",
    "Options:",
    ...options.map(([flags, text]) => `  ${flags.padEnd(width)}${text}`),
  ].join("\n");
}

function isHelpWord(value: string): boolean {
  return (HELP_WORDS as readonly string[]).includes(value);
}

function isHelpFlag(value: string): boolean {
  return (HELP_FLAGS as readonly string[]).includes(value);
}

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

/**
 * Split --path off the arguments, touching nothing: a missing value (a help flag
 * included) or a second --path is the invocation's fault, so it is a message and
 * never a command run.
 */
function splitPath(args: readonly string[]): { path: string | undefined; rest: string[] } | { error: string } {
  let path: string | undefined;
  const rest: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg !== PATH_FLAG && !arg.startsWith(`${PATH_FLAG}=`)) {
      rest.push(arg);
      continue;
    }
    if (path !== undefined) return { error: `${PATH_FLAG} given twice` };
    path = arg === PATH_FLAG ? args[++index] : arg.slice(PATH_FLAG.length + 1);
    if (!path || isHelpFlag(path)) return { error: `${PATH_FLAG} needs a directory` };
  }
  return { path, rest };
}

/**
 * Split tree's --level <n>, --level=<n> or -L <n> off the arguments: a whole number, 0 = all, default 1. A missing
 * value, a second one or anything but a whole number is the invocation's fault, so it is a message and never a
 * command run.
 */
function splitLevel(args: readonly string[]): { level: number; rest: string[] } | { error: string } {
  let value: string | undefined;
  const rest: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    const inline = arg.startsWith(`${LEVEL_FLAG}=`);
    if (arg !== LEVEL_FLAG && arg !== LEVEL_SHORT && !inline) {
      rest.push(arg);
      continue;
    }
    if (value !== undefined) return { error: `${LEVEL_FLAG} given twice` };
    value = inline ? arg.slice(LEVEL_FLAG.length + 1) : (args[++index] ?? "");
    if (value === "") return { error: `${LEVEL_FLAG} needs a whole number` };
    if (!/^\d+$/.test(value)) return { error: `${LEVEL_FLAG} needs a whole number, got '${value}'` };
  }
  return { level: value === undefined ? DEFAULT_LEVEL : Number(value), rest };
}

/** Whether `dir` is a directory; a path through a file or an unreadable one is not, whatever stat throws. */
function isDirectory(dir: string): boolean {
  try {
    return statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
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
  const split = splitPath(args);
  if ("error" in split) {
    console.error(`nuhokai ${first}: ${split.error}\n\n${commandUsage(first)}`);
    return 2;
  }
  const { path } = split;
  let { rest } = split;
  let level = DEFAULT_LEVEL;
  if (first === "tree") {
    const levelSplit = splitLevel(rest);
    if ("error" in levelSplit) {
      console.error(`nuhokai ${first}: ${levelSplit.error}\n\n${commandUsage(first)}`);
      return 2;
    }
    ({ level, rest } = levelSplit);
  }
  if (rest.length === 1 && isHelpFlag(rest[0] ?? "")) {
    console.log(commandUsage(first));
    return 0;
  }
  const helpFlag = rest.find((value) => isHelpFlag(value));
  if (helpFlag !== undefined) {
    console.error(`nuhokai ${first}: unexpected argument '${helpFlag}'\n\n${commandUsage(first)}`);
    return 2;
  }
  // --path and the command's own options are split off; any other dash argument is a mistyped or unknown flag.
  const option = rest.find((value) => value.startsWith("-"));
  if (option !== undefined) {
    console.error(`nuhokai ${first}: unknown option '${option}'\n\n${commandUsage(first)}`);
    return 2;
  }
  // The project directory is --path against the cwd, else the cwd itself.
  const cwd = process.cwd();
  const dir = resolve(cwd, path ?? ".");
  if (!isDirectory(dir)) {
    console.error(`nuhokai ${first}: not a directory: ${path ?? "."}\n\n${commandUsage(first)}`);
    return 2;
  }
  const [min, max] = ARITY[first];
  if (rest.length > max) {
    console.error(`nuhokai ${first}: unexpected argument '${rest[max]}'\n\n${commandUsage(first)}`);
    return 2;
  }
  if (rest.length < min) {
    const expected = min === 1 ? "1 argument" : `${min} arguments`;
    console.error(`nuhokai ${first}: expected ${expected}, got ${rest.length}\n\n${commandUsage(first)}`);
    return 2;
  }
  // Commands get the directory as named from the cwd, so every path they print opens as printed.
  const root = relative(cwd, dir).split(sep).join("/") || ".";
  if (first === "check") {
    // The checker's client is only check's to load.
    const { runCheck } = await import("./check/index.ts");
    return runCheck(root);
  }
  if (first === "init") return runInit(root);
  if (first === "map") {
    // The map's assets weigh hundreds of KB; only map loads them.
    const { runMap } = await import("./map/index.ts");
    return runMap(root);
  }
  if (first === "new") return runNew(root, rest[0] ?? "");
  if (first === "tree") {
    const { runTree } = await import("./tree/index.ts");
    return runTree(root, rest[0], level);
  }
  console.error(`nuhokai ${first}: not implemented yet`);
  return 1;
}

if (import.meta.main) {
  process.exitCode = await main(Bun.argv.slice(2));
}
