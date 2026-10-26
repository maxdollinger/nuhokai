#!/usr/bin/env bun

/** Commands the CLI exposes. `map` and `write` come later, from the same loader. */
export const COMMANDS = ["check", "init", "update"] as const;

export type Command = (typeof COMMANDS)[number];

const DESCRIPTIONS: Record<Command, string> = {
  check: "Load the world, run tsc and the global rules, print one diagnostics list",
  init: "Write the world skeleton, the CLI-owned tsconfig and the @nuhokai/world types",
  update: "Refresh the CLI-owned tsconfig and the @nuhokai/world types of the world in the cwd",
};

const HELP_WORDS = ["help", "--help", "-h"] as const;

export function usage(): string {
  return [
    "nuhokai — the world format toolchain",
    "",
    "Usage: nuhokai <command> [options]",
    "",
    "Commands:",
    ...COMMANDS.map((command) => `  ${command.padEnd(8)}${DESCRIPTIONS[command]}`),
    "",
    "Run `nuhokai <command> --help` for command options.",
  ].join("\n");
}

/** One help text per command, answered by Cli before dispatch; commands stay flag-free. */
export function commandUsage(command: Command): string {
  return [
    `nuhokai ${command} — ${DESCRIPTIONS[command]}`,
    "",
    `Usage: nuhokai ${command}`,
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

/** Resolves to the process exit code: 0 ok, 1 diagnostics or failure, 2 usage error. */
export async function main(argv: readonly string[]): Promise<number> {
  const [first] = argv;
  if (!first || isHelpWord(first)) {
    console.log(usage());
    return 0;
  }
  if (!isCommand(first)) {
    console.error(`nuhokai: unknown command '${first}'\n\n${usage()}`);
    return 2;
  }
  if (argv.slice(1).some(isHelpWord)) {
    console.log(commandUsage(first));
    return 0;
  }
  console.error(`nuhokai ${first}: not implemented yet`);
  return 1;
}

if (import.meta.main) {
  process.exitCode = await main(Bun.argv.slice(2));
}
