import type { LoadedWorld } from "../../load/load-world.ts";
import { compareFindings, type Finding } from "../diagnostics.ts";
import { checkDataRules } from "./data-rules.ts";
import { checkSourceRules } from "./source-rules.ts";

/**
 * The spec check: DataRules and SourceRules on the loaded world of the project directory `root`, their findings in
 * one order. A rule group that throws is a bug and propagates.
 */
export function applyRules(root: string, world: LoadedWorld): Finding[] {
  return [...checkDataRules(world), ...checkSourceRules(root, world)].sort(compareFindings);
}
