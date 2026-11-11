/** What a command answers instead of printing: Cli alone writes the lines and turns the outcome into an exit code. */
import { errorLine, InvalidArgument, isExpected } from "./failure.ts";

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

/** A result line: Cli prints it on stdout. */
export function resultLine(text: string): ReportLine {
  return { kind: "result", text };
}

/** A failure line, without the command prefix: Cli prints it on stderr after 'nuhokai <command>: '. */
export function failureLine(text: string): ReportLine {
  return { kind: "failure", text };
}

/** An ok Report of these result lines. */
export function ok(texts: readonly string[]): Report {
  return { outcome: "ok", lines: texts.map(resultLine) };
}

/** The failure line for a thrown value a command expects (Failure R1); a bug is rethrown, to crash with its stack. */
export function failureLineFrom(thrown: unknown): ReportLine {
  if (!isExpected(thrown)) throw thrown;
  return failureLine(errorLine(thrown));
}

/**
 * The Report of one failure line for an expected thrown value: invalid for an InvalidArgument, else failed; a bug is
 * rethrown.
 */
function reportFrom(thrown: unknown): Report {
  const line = failureLineFrom(thrown);
  return { outcome: thrown instanceof InvalidArgument ? "invalid" : "failed", lines: [line] };
}

/**
 * Run a command that answers its Report or throws: an InvalidArgument becomes an invalid Report of its one line, any
 * other expected failure a failed one (Failure R1); a bug is rethrown, to crash with its stack.
 */
export async function orFailed(command: () => Promise<Report>): Promise<Report> {
  try {
    return await command();
  } catch (thrown) {
    return reportFrom(thrown);
  }
}

/** A bug that cut a command short, carrying the lines it had answered so far: Cli prints them, then rethrows the bug. */
export class CutShort extends Error {
  constructor(
    readonly lines: readonly ReportLine[],
    readonly bug: unknown,
  ) {
    super("a bug cut the command short");
    this.name = "CutShort";
  }
}

/**
 * Run a command that adds its lines as it goes and answers its Report. A bug escaping it is a CutShort carrying the
 * lines added so far, so nothing the command found before the bug is lost.
 */
export async function collecting(command: (lines: ReportLine[]) => Promise<Report>): Promise<Report> {
  const lines: ReportLine[] = [];
  try {
    return await command(lines);
  } catch (bug) {
    throw new CutShort(lines, bug);
  }
}
