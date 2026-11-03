import type { Outcome, Report } from "./report.ts";

/** A Report as Cli would print it: its outcome, its result lines (stdout) and its failure lines (stderr). */
export interface SplitReport {
  readonly outcome: Outcome;
  readonly out: string[];
  readonly err: string[];
}

/**
 * For tests: split a command's Report into the lines Cli prints on stdout and on stderr, each in order; with `root`,
 * the project directory in every line is written as <root>.
 */
export function splitReport(report: Report, root?: string): SplitReport {
  const texts = (kind: "result" | "failure") =>
    report.lines
      .filter((line) => line.kind === kind)
      .map((line) => (root === undefined ? line.text : line.text.replaceAll(root, "<root>")));
  return { outcome: report.outcome, out: texts("result"), err: texts("failure") };
}
