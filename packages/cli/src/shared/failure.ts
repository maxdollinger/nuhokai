/** The CLI's shared failure surface: one expectable-failure type and the one-line rule. */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

/** One line, whatever the thrown value: stderr gets exactly one line per failure. */
export function oneLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s*\n\s*/g, " ").trim() || "unknown error";
}
