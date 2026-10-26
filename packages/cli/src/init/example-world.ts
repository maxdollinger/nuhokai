import { mkdirSync, writeFileSync } from "node:fs";
import { fromRoot, inWorld, WORLD_EXAMPLE, WORLD_INDEX } from "../shared/paths.ts";

/** The world entry point: the loader's only entry, listing the one example node. */
export const WORLD_INDEX_TEMPLATE = `import { defineWorld } from "@nuhokai/world";
import { Example } from "./example.ts";

/** The world: the loader's only entry point, listing every top-level node. */
export default defineWorld({
  children: [Example],
});
`;

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

export const EXAMPLE_WORLD_PATHS = [fromRoot(WORLD_INDEX), fromRoot(WORLD_EXAMPLE)] as const;

/** Lay down the authored example world inside an existing directory. */
export function writeExampleWorld(dir: string): string[] {
  mkdirSync(inWorld(dir), { recursive: true });
  writeFileSync(inWorld(dir, WORLD_INDEX), WORLD_INDEX_TEMPLATE);
  writeFileSync(inWorld(dir, WORLD_EXAMPLE), EXAMPLE_TEMPLATE);
  return [...EXAMPLE_WORLD_PATHS];
}
