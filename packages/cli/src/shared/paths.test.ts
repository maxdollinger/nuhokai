import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  shown,
  WORLD_INDEX,
  WORLD_MAP,
  WORLD_TSCONFIG,
  WORLD_TYPES_DIR,
  WORLD_TYPES_FILE,
  worldFile,
} from "./paths.ts";

const ROOT = join("/", "repo");

test("a file in the world: absolute under the root, from-root with / separators", () => {
  expect(worldFile(ROOT, "new", "stock-order.ts")).toEqual({
    absolute: join(ROOT, "nuhokai", "new", "stock-order.ts"),
    fromRoot: "nuhokai/new/stock-order.ts",
  });
});

test("the world's own files come from these names", () => {
  expect(
    [WORLD_INDEX, WORLD_TSCONFIG, `${WORLD_TYPES_DIR}/${WORLD_TYPES_FILE}`, WORLD_MAP].map(
      (name) => worldFile(ROOT, name).fromRoot,
    ),
  ).toEqual([
    "nuhokai/index.ts",
    "nuhokai/tsconfig.json",
    "nuhokai/.generated/world/index.d.ts",
    "nuhokai/.generated/map.html",
  ]);
});

test("segments pass through unchanged and nothing is touched", () => {
  const missing = join(ROOT, "does-not-exist");

  expect(worldFile(missing, "-Odd.Name", "x.y.ts").fromRoot).toBe("nuhokai/-Odd.Name/x.y.ts");
  expect(worldFile(missing, "-Odd.Name", "x.y.ts").absolute).toBe(join(missing, "nuhokai", "-Odd.Name", "x.y.ts"));
});

test("stdout shows a from-root path under the project directory as named from the cwd", () => {
  expect(shown("packages/cli", "nuhokai/.generated/map.html")).toBe("packages/cli/nuhokai/.generated/map.html");
  expect(shown("", "nuhokai/.generated/map.html")).toBe("nuhokai/.generated/map.html");
});
