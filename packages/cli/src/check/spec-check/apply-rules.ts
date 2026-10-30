import type { LoadedWorld } from "../../load/load-world.ts";
import type { Finding } from "../diagnostics.ts";
import { checkData } from "./data-rules.ts";
import { checkSources } from "./source-rules.ts";

/** Plain code-unit order, so the same world gives byte-identical output on every machine. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** File, then line (a finding without one first), then rule, then node. */
function compareFindings(a: Finding, b: Finding): number {
  return (
    compare(a.file, b.file) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    compare(a.rule, b.rule) ||
    compare(a.node ?? "", b.node ?? "")
  );
}

/**
 * The spec check: DataRules and SourceRules on the loaded world of the project directory `root`, their findings in
 * one order. A rule group that throws is a bug and propagates.
 */
export function applyRules(root: string, world: LoadedWorld): Finding[] {
  return [...checkData(world), ...checkSources(root, world)].sort(compareFindings);
}
