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

/** The argument form each command takes, as usage shows it; ARITY holds the count Cli enforces. */
const SYNOPSIS: Record<Command, string> = {
  check: "nuhokai check",
  init: "nuhokai init",
  map: "nuhokai map",
  new: "nuhokai new <file-path>",
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

/** An option Cli parses: its spellings (the first is its name), the value it takes, and its help line. */
interface Option {
  readonly names: readonly [string, ...string[]];
  readonly value: string;
  /** What a missing value needed: "--path needs a directory". */
  readonly needs: string;
  readonly text: string;
}

/** The one option every command takes: the project directory holding nuhokai/, instead of the cwd. */
const PATH_OPTION: Option = {
  names: ["--path"],
  value: "<dir>",
  needs: "a directory",
  text: "the project directory holding nuhokai/ (default: the current directory)",
};

const DEFAULT_LEVEL = 1;

/** tree's own option: how many levels below the start to print; 0 = all. */
const LEVEL_OPTION: Option = {
  names: ["--level", "-L"],
  value: "<n>",
  needs: "a whole number",
  text: `levels below the start to print; 0 = all (default: ${DEFAULT_LEVEL})`,
};

/** Each command's own options beside --path: Cli parses them, lists them in its help and hands run their values. */
const OPTIONS: Record<Command, readonly Option[]> = {
  check: [],
  init: [],
  map: [],
  new: [],
  tree: [LEVEL_OPTION],
  update: [],
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
    ...[...OPTIONS[command], PATH_OPTION].map((option): [string, string] => [
      `${[...option.names].sort((a, b) => a.length - b.length).join(", ")} ${option.value}`,
      option.text,
    ]),
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
 * Split one option off the arguments, touching nothing else: `--name <value>`, `--name=<value>` for a long name,
 * or a short name and its value. A missing value (a help flag included) or a second occurrence is the
 * invocation's fault, so it is a message naming the spelling typed, never a command run. The value itself is the
 * caller's to judge, after help.
 */
function splitOption(
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
  // Cli parses every option, --path and the command's own, and hands run their values.
  let rest = args;
  const values = new Map<Option, { spelling: string; raw: string }>();
  for (const option of [PATH_OPTION, ...OPTIONS[first]]) {
    const split = splitOption(rest, option);
    if ("error" in split) {
      console.error(`nuhokai ${first}: ${split.error}\n\n${commandUsage(first)}`);
      return 2;
    }
    rest = split.rest;
    if (split.value) values.set(option, split.value);
  }
  const path = values.get(PATH_OPTION)?.raw;
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
  const levelValue = values.get(LEVEL_OPTION);
  if (levelValue !== undefined && !/^\d+$/.test(levelValue.raw)) {
    const error = `${levelValue.spelling} needs ${LEVEL_OPTION.needs}, got '${levelValue.raw}'`;
    console.error(`nuhokai ${first}: ${error}\n\n${commandUsage(first)}`);
    return 2;
  }
  const level = levelValue === undefined ? DEFAULT_LEVEL : Number(levelValue.raw);
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
