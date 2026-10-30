import { oneLine } from "../shared/failure.ts";

/** One violation a check found: what Diagnostics.format turns into a line. */
export interface Finding {
  readonly severity: "error" | "warning";
  /** Named from the cwd, as the loader names world files. */
  readonly file: string;
  readonly line?: number;
  /** The node's path from the world, `Check/SpecCheck`; absent when the file defines no node to name. */
  readonly node?: string;
  /** The broken rule, one sentence. */
  readonly rule: string;
  /** How to fix it, listing the alternatives when there is a choice. */
  readonly fix?: string;
}

/**
 * One finding as one line, `<severity>: <file>:<line>: <node>: <rule>; <fix>`.
 * A missing line, node or fix drops its part; every text field is flattened to one line.
 */
export function formatFinding(finding: Finding): string {
  const at = finding.line === undefined ? oneLine(finding.file) : `${oneLine(finding.file)}:${finding.line}`;
  const parts = [`${finding.severity}: ${at}`];
  if (finding.node !== undefined) parts.push(oneLine(finding.node));
  const rule = oneLine(finding.rule);
  parts.push(finding.fix === undefined ? rule : `${rule}; ${oneLine(finding.fix)}`);
  return parts.join(": ");
}
