import { mkdirSync, writeFileSync } from "node:fs";
import { inWorld, WORLD_EXAMPLE, WORLD_INDEX } from "../shared/paths.ts";

/** The world entry point under the world id `id`: the loader's only entry, listing the one example node. */
export function worldIndexSource(id: string): string {
  return `import { defineWorld } from "@nuhokai/world";
import { Example } from "./example.ts";

/** The world: the loader's only entry point, listing every top-level node under the world's own id. */
export default defineWorld({
  id: "${id}",
  children: [Example],
});
`;
}

/** One node in its own file: an own port, a typed hole and a uses edge to it. */
export const EXAMPLE_TEMPLATE = `import { node, tbd } from "@nuhokai/world";

/**
 * A typed hole: a port that is not designed yet. Declare holes at module level
 * and export them, so find-references lists every dependent.
 */
export const later = tbd.call({ description: "Describe what this node has to do" });

/**
 * The example node: copy its shape, then replace it with the first real node.
 * It shows the two steps, an own port and a lazy uses edge to the hole above.
 */
export const Example = node({
  id: "01a17290-3f10-7c54-8e51-0b63d9f2a7c4",
  purpose: "An example to copy from; replace it with the first real node.",
  status: "planned",
  source: [],
  ports: {
    greet: {
      kind: "call",
      purpose: "Say hello",
      input: "a name",
      output: "a greeting",
    },
  },
}).edges({
  uses: () => [later],
});
`;

/** The two files, by their path inside the world folder. */
export const EXAMPLE_WORLD_PATHS = [WORLD_INDEX, WORLD_EXAMPLE] as const;

/** Lay down the authored example world inside an existing directory, under a fresh world id. */
export function writeExampleWorld(dir: string): string[] {
  mkdirSync(inWorld(dir), { recursive: true });
  writeFileSync(inWorld(dir, WORLD_INDEX), worldIndexSource(Bun.randomUUIDv7()));
  writeFileSync(inWorld(dir, WORLD_EXAMPLE), EXAMPLE_TEMPLATE);
  return [...EXAMPLE_WORLD_PATHS];
}
