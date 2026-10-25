#!/usr/bin/env bun

/** Commands the CLI exposes. `map` and `write` come later, from the same loader. */
export const COMMANDS = ["check", "init", "sync"] as const;

export type Command = (typeof COMMANDS)[number];

export function usage(): string {
  return [
    "nuhokai — the world format toolchain",
    "",
    "Usage: nuhokai <command> [options]",
    "",
    "Commands:",
    "  check   Load the world, run tsc and the global rules, print one diagnostics list",
    "  init    Write the world skeleton, the CLI-owned tsconfig and the @nuhokai/world types",
    "  sync    Refresh the CLI-owned tsconfig and the @nuhokai/world types",
    "",
    "Run `nuhokai <command> --help` for command options.",
  ].join("\n");
}

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

/** Resolves to the process exit code: 0 ok, 1 diagnostics or failure, 2 usage error. */
export async function main(argv: readonly string[]): Promise<number> {
  const [first] = argv;
  if (!first || first === "help" || first === "--help" || first === "-h") {
    console.log(usage());
    return 0;
  }
  if (!isCommand(first)) {
    console.error(`nuhokai: unknown command '${first}'\n\n${usage()}`);
    return 2;
  }
  console.error(`nuhokai ${first}: not implemented yet`);
  return 1;
}

if (import.meta.main) {
  process.exitCode = await main(Bun.argv.slice(2));
}
