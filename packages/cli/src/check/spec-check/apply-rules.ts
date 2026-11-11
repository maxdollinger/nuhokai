import type { LoadedWorld } from "../../load/load-world.ts";
import { type Finding, order } from "../../shared/diagnostics.ts";
import { checkDataRules } from "./data-rules.ts";
import { idsOf } from "./ids.ts";
import { checkSourceRules } from "./source-rules.ts";

/**
 * The spec check: the problems LoadWorld found with the world's field shapes, then DataRules and SourceRules on the
 * loaded world of the project directory `root`, their findings in one order, over the ids they share. A shape
 * problem in a file TypeCheck found an error in is left out: tsc already reports that break there. `typeErrors`: the files TypeCheck found an error in; after any, SpecCheck R5,
 * which re-checks tsc's rules, is left out, and after one in the world's defineWorld file DataRules R4, which
 * re-checks tsc's rule on the world's name.
 * A rule group that throws is a bug and propagates.
 */
export function applyRules(root: string, world: LoadedWorld, typeErrors: ReadonlySet<string> = new Set()): Finding[] {
  const ids = idsOf(world);
  const problems = world.problems.filter((problem) => !typeErrors.has(problem.file));
  return [...problems, ...checkDataRules(world, ids, typeErrors), ...checkSourceRules(root, world, ids)].sort(order);
}
