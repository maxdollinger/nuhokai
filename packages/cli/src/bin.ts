#!/usr/bin/env -S bun --no-install

import { statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { runInit } from "./init/index.ts";
import { runNew } from "./new/index.ts";

/** The commands the CLI exposes; `check` and `update` are planned, `init`, `map` and `new` run today. */
export const COMMANDS = ["check", "init", "map", "new", "update"] as const;

export type Command = (typeof COMMANDS)[number];

const DESCRIPTIONS: Record<Command, string> = {
  check: "Load the world, run tsc and the global rules, print one diagnostics list",
  init: "Write the world skeleton, the CLI-owned tsconfig and the @nuhokai/world types",
  map: "Draw the world into nuhokai/.generated/map.html, a self-contained 3D map",
  new: "Add one node file with a fresh id and TODO placeholders to an existing world",
  update: "Refresh the CLI-owned tsconfig and the @nuhokai/world types of an existing world",
};

/** The argument form each command takes; usage shows it, Cli enforces the count and nothing else. */
const SYNOPSIS: Record<Command, string> = {
  check: "nuhokai check",
  init: "nuhokai init",
  map: "nuhokai map",
  new: "nuhokai new <node-path>",
  update: "nuhokai update",
};

/** How many positional arguments each command takes; the value is the command's to validate. */
const ARITY: Record<Command, number> = { check: 0, init: 0, map: 0, new: 1, update: 0 };

/** Help before a command; after one only the flags are help, so `nuhokai new help` adds nuhokai/help.ts. */
const HELP_WORDS = ["help", "--help", "-h"] as const;
const HELP_FLAGS = ["--help", "-h"] as const;

/** The one flag every command takes: the project directory holding nuhokai/, instead of the cwd. */
const PATH_FLAG = "--path";

export function usage(): string {
  return [
    "nuhokai — the world format toolchain",
    "",
    "Usage: nuhokai <command> [--path <dir>] [arguments]",
    "",
    "Commands:",
    ...COMMANDS.map((command) => `  ${SYNOPSIS[command].padEnd(25)}${DESCRIPTIONS[command]}`),
    "",
    "Run `nuhokai <command> --help` for command options.",
  ].join("\n");
}

/** One help text per command, answered by Cli before dispatch; commands stay flag-free, Cli owns --path. */
export function commandUsage(command: Command): string {
  return [
    `nuhokai ${command} — ${DESCRIPTIONS[command]}`,
    "",
    `Usage: ${SYNOPSIS[command]}`,
    "",
    "Options:",
    "  --path <dir>  the project directory holding nuhokai/ (default: the current directory)",
    "  --help        show this help",
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
  const { path, rest } = split;
  if (rest.length === 1 && isHelpFlag(rest[0] ?? "")) {
    console.log(commandUsage(first));
    return 0;
  }
  const helpFlag = rest.find((value) => isHelpFlag(value));
  if (helpFlag !== undefined) {
    console.error(`nuhokai ${first}: unexpected argument '${helpFlag}'\n\n${commandUsage(first)}`);
    return 2;
  }
  // --path is the only option; any other dash argument is a mistyped or unknown flag, never an argument.
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
  if (rest.length > ARITY[first]) {
    console.error(`nuhokai ${first}: unexpected argument '${rest[ARITY[first]]}'\n\n${commandUsage(first)}`);
    return 2;
  }
  if (rest.length < ARITY[first]) {
    const expected = ARITY[first] === 1 ? "1 argument" : `${ARITY[first]} arguments`;
    console.error(`nuhokai ${first}: expected ${expected}, got ${rest.length}\n\n${commandUsage(first)}`);
    return 2;
  }
  // Commands get the directory as named from the cwd, so every path they print opens as printed.
  const root = relative(cwd, dir).split(sep).join("/") || ".";
  if (first === "init") return runInit(root);
  if (first === "map") {
    // The map's assets weigh hundreds of KB; only map loads them.
    const { runMap } = await import("./map/index.ts");
    return runMap(root);
  }
  if (first === "new") return runNew(root, rest[0] ?? "");
  console.error(`nuhokai ${first}: not implemented yet`);
  return 1;
}

if (import.meta.main) {
  process.exitCode = await main(Bun.argv.slice(2));
}
