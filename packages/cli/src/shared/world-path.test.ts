import { expect, test } from "bun:test";
import {
  compareText,
  isInside,
  nameInProject,
  nameInWorld,
  suggestedCommand,
  WORLD_INDEX,
  WORLD_MAP,
  WORLD_TSCONFIG,
  WORLD_TYPES_PATH,
} from "./world-path.ts";

test("a file in the world, named from the cwd: under the project directory, with / separators", () => {
  expect(nameInWorld("packages/cli", "stock", "reserve.ts")).toBe("packages/cli/nuhokai/stock/reserve.ts");
  expect(nameInWorld("/repo", "stock", "reserve.ts")).toBe("/repo/nuhokai/stock/reserve.ts");
});

test("the cwd as project directory adds no ./ prefix", () => {
  expect(nameInWorld(".", WORLD_MAP)).toBe("nuhokai/.generated/map.html");
  expect(nameInWorld(".")).toBe("nuhokai");
});

test("the world's own files come from these names", () => {
  expect([WORLD_INDEX, WORLD_TSCONFIG, WORLD_TYPES_PATH, WORLD_MAP].map((name) => nameInWorld(".", name))).toEqual([
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

test("a suggested command runs as printed: every word the shell would split or expand is quoted", () => {
  expect(suggestedCommand("tree", ["Shop"], ".")).toBe("`nuhokai tree Shop`");
  expect(suggestedCommand("init", [], "packages/app")).toBe("`nuhokai init --path packages/app`");
  expect(suggestedCommand("init", [], "a;touch x")).toBe("`nuhokai init --path 'a;touch x'`");
  expect(suggestedCommand("tree", ["it's"], "sp ace")).toBe("`nuhokai tree 'it'\\''s' --path 'sp ace'`");
});

test("inside: the directory itself or below it, never a sibling sharing its prefix", () => {
  expect(isInside("/a/b", "/a/b")).toBe(true);
  expect(isInside("/a/b/c", "/a/b")).toBe(true);
  expect(isInside("/a/bc", "/a/b")).toBe(false);
  expect(isInside("/x", "/")).toBe(true);
});

test("WorldPath R7: compareText is code-unit order, never the locale's", () => {
  expect(["a/x", "a.ts", "a", "B"].sort(compareText)).toEqual(["B", "a", "a.ts", "a/x"]);
  expect(compareText("x", "x")).toBe(0);
});
