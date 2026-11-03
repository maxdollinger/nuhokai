import type { LoadedWorld } from "../../load/load-world.ts";
import { compareFindings, type Finding } from "../diagnostics.ts";
import { checkDataRules } from "./data-rules.ts";
import { checkSourceRules } from "./source-rules.ts";

/**
 * The spec check: DataRules and SourceRules on the loaded world of the project directory `root`, their findings in
 * one order. `typeErrors`: TypeCheck found an error, so SpecCheck R5, which re-checks tsc's rules, is left out.
 * A rule group that throws is a bug and propagates.
 */
export function applyRules(root: string, world: LoadedWorld, typeErrors = false): Finding[] {
  return [...checkDataRules(world, typeErrors), ...checkSourceRules(root, world)].sort(compareFindings);
}
