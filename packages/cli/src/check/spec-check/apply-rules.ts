import type { LoadedWorld } from "../../load/load-world.ts";
import { type Finding, order } from "../../shared/diagnostics.ts";
import { checkDataRules } from "./data-rules.ts";
import { idsOf } from "./ids.ts";
import { checkSourceRules } from "./source-rules.ts";

/**
 * The spec check: DataRules and SourceRules on the loaded world of the project directory `root`, their findings in
 * one order, over the ids they share. `typeErrors`: the files TypeCheck found an error in; after any, SpecCheck R5,
 * which re-checks tsc's rules, is left out, and after one in the world's defineWorld file DataRules R4, which
 * re-checks tsc's rule on the world's name.
 * A rule group that throws is a bug and propagates.
 */
export function applyRules(root: string, world: LoadedWorld, typeErrors: ReadonlySet<string> = new Set()): Finding[] {
  const ids = idsOf(world);
  return [...checkDataRules(world, ids, typeErrors), ...checkSourceRules(root, world, ids)].sort(order);
}
