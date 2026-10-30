import type { LoadedWorld } from "../load/load-world.ts";
import type { Finding } from "./diagnostics.ts";

/** The code check against the loaded world: a stub that finds nothing until MAX-23 designs it. */
export function runCodeCheck(_world: LoadedWorld): Finding[] {
  return [];
}
