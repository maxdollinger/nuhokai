/** What a command answers instead of printing: Cli alone writes the lines and turns the outcome into an exit code. */

/** How the command ended; Cli alone maps it to an exit code: ok 0, failed 1, invalid 2. */
export type Outcome = "ok" | "failed" | "invalid";

/** One line for Cli to print: a result line goes to stdout, a failure line to stderr, prefixed by Cli. */
export interface ReportLine {
  readonly kind: "result" | "failure";
  readonly text: string;
}

/** A command's whole answer: its lines in the order they are printed, and how it ended. */
export interface Report {
  readonly outcome: Outcome;
  readonly lines: readonly ReportLine[];
}

/** A result line: Cli prints it on stdout as it is. */
export function result(text: string): ReportLine {
  return { kind: "result", text };
}

/** A failure line, without the command prefix: Cli prints it on stderr after 'nuhokai <command>: '. */
export function failure(text: string): ReportLine {
  return { kind: "failure", text };
}
