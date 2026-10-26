/** The CLI's shared failure surface: the expectable-failure type, the failure-or-bug test, and the one-line rule. */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

/** Whether a command expects to explain a thrown value: a CliError, or a filesystem failure. */
export function isExpected(error: unknown): boolean {
  if (error instanceof CliError) return true;
  // Filesystem failures are Errors carrying a numeric errno; programming errors are not.
  return error instanceof Error && typeof (error as { errno?: unknown }).errno === "number";
}

/** One line, whatever the thrown value: stderr gets exactly one line per failure. */
export function oneLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s*\n\s*/g, " ").trim() || "unknown error";
}
