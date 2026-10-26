/** A failure init can explain on one stderr line. */
export class InitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitError";
  }
}

/** One line, whatever the thrown value: stderr gets exactly one line per failure. */
export function oneLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s*\n\s*/g, " ").trim() || "unknown error";
}
