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
 * A run of control characters (escape sequences, carriage returns, newlines) or of the bidirectional format
 * characters that reorder what a terminal shows (Trojan Source).
 */
const CONTROLS = /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]+/gu;

/**
 * Text with each run of controls as one space and nothing else touched (Terminal R1): what Cli does to every line
 * it prints, so nothing a user typed or a world file holds reaches the terminal as a control code.
 */
export function plainText(text: string): string {
  return text.replace(CONTROLS, " ");
}

/** Text as one plain line: plainText, then every run of whitespace one space, trimmed. */
export function oneLine(text: string): string {
  return plainText(text).replace(/\s+/g, " ").trim();
}

/**
 * A JSON-like value as a message names it: `"x"`, `3`, `a list`, `an object`, `null`. A string's whitespace other than
 * a lone space is escaped (`"a\u00a0b"`, `"a\tb"`, `"a \u0020b"`), so a message shows it even as one line.
 */
export function inWords(value: unknown): string {
  if (Array.isArray(value)) return "a list";
  if (value === null) return "null";
  if (typeof value === "object") return "an object";
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return String(value);
    return json.replace(/[^\S ]|(?<= ) /gu, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  } catch {
    return String(value);
  }
}

/** One line, whatever the thrown value: stderr gets exactly one line per failure. */
export function errorLine(error: unknown): string {
  return oneLine(error instanceof Error ? error.message : String(error)) || "unknown error";
}
