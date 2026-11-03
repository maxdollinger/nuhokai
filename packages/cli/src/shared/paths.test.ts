import { expect, test } from "bun:test";
import {
  nameInProject,
  nameInWorld,
  WORLD_INDEX,
  WORLD_MAP,
  WORLD_TSCONFIG,
  WORLD_TYPES_DIR,
  WORLD_TYPES_FILE,
} from "./paths.ts";

test("a file in the world, named from the cwd: under the project directory, with / separators", () => {
  expect(nameInWorld("packages/cli", "stock", "reserve.ts")).toBe("packages/cli/nuhokai/stock/reserve.ts");
  expect(nameInWorld("/repo", "stock", "reserve.ts")).toBe("/repo/nuhokai/stock/reserve.ts");
});

test("the cwd as project directory adds no ./ prefix", () => {
  expect(nameInWorld(".", WORLD_MAP)).toBe("nuhokai/.generated/map.html");
  expect(nameInWorld(".")).toBe("nuhokai");
});

test("the world's own files come from these names", () => {
  expect(
    [WORLD_INDEX, WORLD_TSCONFIG, `${WORLD_TYPES_DIR}/${WORLD_TYPES_FILE}`, WORLD_MAP].map((name) =>
      nameInWorld(".", name),
    ),
  ).toEqual([
    "nuhokai/index.ts",
    "nuhokai/tsconfig.json",
    "nuhokai/.generated/world/index.d.ts",
    "nuhokai/.generated/map.html",
  ]);
});

test("segments pass through unchanged and nothing is touched", () => {
  expect(nameInWorld("does-not-exist", "-Odd.Name", "x.y.ts")).toBe("does-not-exist/nuhokai/-Odd.Name/x.y.ts");
});

test("WorldPath R5: a project path, named from the cwd, globs unchanged and no ./ for the cwd", () => {
  expect(nameInProject("packages/cli", "src/bin.ts")).toBe("packages/cli/src/bin.ts");
  expect(nameInProject("packages/cli", "src/**")).toBe("packages/cli/src/**");
  expect(nameInProject(".", "src/**")).toBe("src/**");
  expect(nameInProject(".", "src/{a,b}/[x]?.ts")).toBe("src/{a,b}/[x]?.ts");
  expect(nameInProject("packages/cli", "/etc/x")).toBe("/etc/x");
});
