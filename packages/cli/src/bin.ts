#!/usr/bin/env bun

import { runInit } from "./init/index.ts";
import { runMap } from "./map/index.ts";
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
  new: "nuhokai new <path>",
  update: "nuhokai update",
};

/** How many positional arguments each command takes; the value is the command's to validate. */
const ARITY: Record<Command, number> = { check: 0, init: 0, map: 0, new: 1, update: 0 };

const HELP_WORDS = ["help", "--help", "-h"] as const;

export function usage(): string {
  return [
    "nuhokai — the world format toolchain",
    "",
    "Usage: nuhokai <command> [options]",
    "",
    "Commands:",
    ...COMMANDS.map((command) => `  ${SYNOPSIS[command].padEnd(21)}${DESCRIPTIONS[command]}`),
    "",
    "Run `nuhokai <command> --help` for command options.",
  ].join("\n");
}

/** One help text per command, answered by Cli before dispatch; commands stay flag-free. */
export function commandUsage(command: Command): string {
  return [
    `nuhokai ${command} — ${DESCRIPTIONS[command]}`,
    "",
    `Usage: ${SYNOPSIS[command]}`,
    "",
    "Options:",
    "  --help    show this help",
  ].join("\n");
}

function isHelpWord(value: string): boolean {
  return (HELP_WORDS as readonly string[]).includes(value);
}

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

/** Resolves to the process exit code: 0 ok, 1 diagnostics or failure, 2 usage or argument error. */
export async function main(argv: readonly string[]): Promise<number> {
  const [first, ...rest] = argv;
  if (first === undefined || isHelpWord(first)) {
    console.log(usage());
    return 0;
  }
  if (!isCommand(first)) {
    console.error(`nuhokai: unknown command '${first}'\n\n${usage()}`);
    return 2;
  }
  if (rest.length === 1 && isHelpWord(rest[0] ?? "")) {
    console.log(commandUsage(first));
    return 0;
  }
  const helpWord = rest.find((value) => isHelpWord(value));
  if (helpWord !== undefined) {
    console.error(`nuhokai ${first}: unexpected argument '${helpWord}'\n\n${commandUsage(first)}`);
    return 2;
  }
  if (rest.length !== ARITY[first]) {
    const expected = ARITY[first] === 1 ? "1 argument" : `${ARITY[first]} arguments`;
    console.error(`nuhokai ${first}: expected ${expected}, got ${rest.length}\n\n${commandUsage(first)}`);
    return 2;
  }
  if (first === "init") return runInit(process.cwd());
  if (first === "map") return runMap(process.cwd());
  if (first === "new") return runNew(process.cwd(), rest[0] ?? "");
  console.error(`nuhokai ${first}: not implemented yet`);
  return 1;
}

if (import.meta.main) {
  process.exitCode = await main(Bun.argv.slice(2));
}
