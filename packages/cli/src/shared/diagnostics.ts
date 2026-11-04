/** The finding check and review print: built at its place, ordered one way, merged and printed as lines, summed up. */
import { oneLine } from "./failure.ts";
import { compareText } from "./world-path.ts";

/** One violation a check found: what Diagnostics.format turns into a line. */
export interface Finding {
  readonly severity: "error" | "warning";
  /** Named from the cwd, as the loader names world files. */
  readonly file: string;
  readonly line?: number;
  /**
   * 1-based, beside a line: set only by TypeCheck and on the load error, so CheckWorld R6 can tell the load error's
   * very position from another break on its line. Never printed, never ordered by.
   */
  readonly column?: number;
  /** The node's path from the world, `Check/SpecCheck`; absent when the file defines no node to name. */
  readonly node?: string;
  /** The broken rule, one sentence. */
  readonly rule: string;
  /** How to fix it, listing the alternatives when there is a choice. */
  readonly fix?: string;
  /** The rule is a message the world format wrote for its reader (a tsc error about a Forbidden<"…">). */
  readonly formatMessage?: true;
}

/** A finding's place: a file and its line when known, as a node, a listing or the world's defineWorld call holds them. */
export function locate(place: { readonly file: string; readonly line?: number | undefined }): {
  file: string;
  line?: number;
} {
  return place.line === undefined ? { file: place.file } : { file: place.file, line: place.line };
}

/** An error about a node: at its node() call, named by its path. */
export function nodeError(
  node: { readonly file: string; readonly line?: number; readonly path: string },
  rule: string,
  fix: string,
): Finding {
  return { severity: "error", ...locate(node), node: node.path, rule, fix };
}

/**
 * The one order of findings: file, then line (a finding without one first), then rule, then node; code-unit order.
 */
export function order(a: Finding, b: Finding): number {
  return (
    compareText(a.file, b.file) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    compareText(a.rule, b.rule) ||
    compareText(a.node ?? "", b.node ?? "")
  );
}

/**
 * One finding as one line, `<severity>: <file>:<line>: <node>: <rule>; <fix>`: no column, the line is where an editor
 * or agent jumps. A missing line, node or fix drops its part; every text field is flattened to one line.
 */
function lineOf(finding: Finding): string {
  const at = `${oneLine(finding.file)}${finding.line === undefined ? "" : `:${finding.line}`}`;
  const parts = [`${finding.severity}: ${at}`];
  if (finding.node !== undefined) parts.push(oneLine(finding.node));
  const rule = oneLine(finding.rule);
  parts.push(finding.fix === undefined ? rule : `${rule}; ${oneLine(finding.fix)}`);
  return parts.join(": ");
}

/**
 * Findings as lines, in the one order (R3): one line each, and findings whose lines are identical (several tsc errors
 * on one line) one line at the first's place, ending in ` (×<n>)`.
 */
export function format(findings: readonly Finding[]): string[] {
  const counts = new Map<string, number>();
  for (const finding of [...findings].sort(order)) {
    const line = lineOf(finding);
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return [...counts].map(([line, count]) => (count === 1 ? line : `${line} (×${count})`));
}

/** A count with its noun: "1 error", "2 warnings". */
function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The line that ends a list of findings, `<ok|failed>: <n> error(s), <n> warning(s)`, counting every finding, merged
 * lines too: failed when any is an error, or when `failed` says the run failed without one. Its prefix is never a
 * finding's severity.
 */
export function summarize(findings: readonly Finding[], failed = false): string {
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const outcome = failed || errors > 0 ? "failed" : "ok";
  return `${outcome}: ${counted(errors, "error")}, ${counted(findings.length - errors, "warning")}`;
}
