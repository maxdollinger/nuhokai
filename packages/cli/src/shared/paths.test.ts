import { expect, test } from "bun:test";
import {
  inProject,
  inWorld,
  WORLD_INDEX,
  WORLD_MAP,
  WORLD_TSCONFIG,
  WORLD_TYPES_DIR,
  WORLD_TYPES_FILE,
} from "./paths.ts";

test("a file in the world, named from the cwd: under the project directory, with / separators", () => {
  expect(inWorld("packages/cli", "new", "stock-order.ts")).toBe("packages/cli/nuhokai/new/stock-order.ts");
  expect(inWorld("/repo", "new", "stock-order.ts")).toBe("/repo/nuhokai/new/stock-order.ts");
});

test("the cwd as project directory adds no ./ prefix", () => {
  expect(inWorld(".", WORLD_MAP)).toBe("nuhokai/.generated/map.html");
  expect(inWorld(".")).toBe("nuhokai");
});

test("the world's own files come from these names", () => {
  expect(
    [WORLD_INDEX, WORLD_TSCONFIG, `${WORLD_TYPES_DIR}/${WORLD_TYPES_FILE}`, WORLD_MAP].map((name) =>
      inWorld(".", name),
    ),
  ).toEqual([
    "nuhokai/index.ts",
    "nuhokai/tsconfig.json",
    "nuhokai/.generated/world/index.d.ts",
    "nuhokai/.generated/map.html",
  ]);
});

test("segments pass through unchanged and nothing is touched", () => {
  expect(inWorld("does-not-exist", "-Odd.Name", "x.y.ts")).toBe("does-not-exist/nuhokai/-Odd.Name/x.y.ts");
});

test("WorldPath R5: a project path, named from the cwd, globs unchanged and no ./ for the cwd", () => {
  expect(inProject("packages/cli", "src/bin.ts")).toBe("packages/cli/src/bin.ts");
  expect(inProject("packages/cli", "src/**")).toBe("packages/cli/src/**");
  expect(inProject(".", "src/**")).toBe("src/**");
  expect(inProject(".", "src/{a,b}/[x]?.ts")).toBe("src/{a,b}/[x]?.ts");
  expect(inProject("packages/cli", "/etc/x")).toBe("/etc/x");
});
