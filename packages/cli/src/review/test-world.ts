/** For the review tests: the CLI's own project directory named from the cwd, as a command names it. */
import { join, relative } from "node:path";
import type { LoadedNode, LoadedWorld } from "../load/load-world.ts";

/** The CLI's own project directory, named from the cwd. */
export const ROOT = relative(process.cwd(), join(import.meta.dir, "../..")) || ".";

/** A path in the CLI's own project, named from the cwd. */
export const named = (path: string) => (ROOT === "." ? path : `${ROOT}/${path}`);

/** The node at a hierarchy path; throws when there is none. */
export function at(world: LoadedWorld, path: string): LoadedNode {
  const node = world.nodes.find((candidate) => candidate.path === path);
  if (!node) throw new Error(`no ${path}`);
  return node;
}
