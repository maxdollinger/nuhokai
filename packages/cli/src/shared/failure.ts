/** The CLI's shared failure surface: the expectable-failure type, the failure-or-bug test, and the one-line rules. */
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

/**
 * Text as one plain line: every run of whitespace or control characters (newlines, escape sequences) is one space,
 * trimmed, so nothing a world file or a thrown message holds can break a line or reach the terminal as a control code.
 */
export function oneLine(text: string): string {
  return text.replace(/[\s\p{Cc}]+/gu, " ").trim();
}

/** One line, whatever the thrown value: stderr gets exactly one line per failure. */
export function errorLine(error: unknown): string {
  return oneLine(error instanceof Error ? error.message : String(error)) || "unknown error";
}
