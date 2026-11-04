import { oneLine } from "./failure.ts";

/** One violation a check found: what Diagnostics.format turns into a line. */
export interface Finding {
  readonly severity: "error" | "warning";
  /** Named from the cwd, as the loader names world files. */
  readonly file: string;
  readonly line?: number;
  /** 1-based, only beside a line: where the break is, to tell two findings on one line apart; never printed. */
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

/** Where in a file, as a finding spreads it in: the line and column that are known, a column only beside a line. */
export function positionOf(at: { readonly line?: number; readonly column?: number }): {
  line?: number;
  column?: number;
} {
  if (at.line === undefined) return {};
  return at.column === undefined ? { line: at.line } : { line: at.line, column: at.column };
}

/** A finding's location: a file and its line and column when known, as a node or a listing holds them. */
export function at(place: { readonly file: string; readonly line?: number; readonly column?: number }): {
  file: string;
  line?: number;
  column?: number;
} {
  return { file: place.file, ...positionOf(place) };
}

/** A finding about the world itself: the file holding the defineWorld call, at that call. */
export function atWorld(world: { readonly definedIn: string; readonly line?: number; readonly column?: number }): {
  file: string;
  line?: number;
  column?: number;
} {
  return { file: world.definedIn, ...positionOf(world) };
}

/** An error about a node: at its node() call, named by its path. */
export function nodeError(
  node: { readonly file: string; readonly line?: number; readonly column?: number; readonly path: string },
  rule: string,
  fix: string,
): Finding {
  return { severity: "error", ...at(node), node: node.path, rule, fix };
}

/**
 * One finding as one line, `<severity>: <file>:<line>: <node>: <rule>; <fix>`: no column, the line is where an editor
 * or agent jumps. A missing line, node or fix drops its part; every text field is flattened to one line.
 */
export function formatFinding(finding: Finding): string {
  const at = `${oneLine(finding.file)}${finding.line === undefined ? "" : `:${finding.line}`}`;
  const parts = [`${finding.severity}: ${at}`];
  if (finding.node !== undefined) parts.push(oneLine(finding.node));
  const rule = oneLine(finding.rule);
  parts.push(finding.fix === undefined ? rule : `${rule}; ${oneLine(finding.fix)}`);
  return parts.join(": ");
}

/** Plain code-unit order, so the same names sort byte-identically on every machine and locale. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The one order of findings: file, then line (a finding without one first), then rule, then node; code-unit order.
 */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    compareText(a.file, b.file) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    compareText(a.rule, b.rule) ||
    compareText(a.node ?? "", b.node ?? "")
  );
}

/** A count with its noun: "1 error", "2 warnings". */
function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The line that ends a list of findings, `<ok|failed>: <n> error(s), <n> warning(s)`: failed when any is an error, or
 * when `failed` says the run failed without one. Its prefix is never a finding's severity.
 */
export function summarize(findings: readonly Finding[], failed = false): string {
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const outcome = failed || errors > 0 ? "failed" : "ok";
  return `${outcome}: ${counted(errors, "error")}, ${counted(findings.length - errors, "warning")}`;
}
