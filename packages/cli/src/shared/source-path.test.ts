import { expect, test } from "bun:test";
import { isGlob, matches, staticPrefix } from "./source-path.ts";

test("R1, R2: src/map/** is a glob below src/map, matching every depth there and nothing beside it", () => {
  expect(isGlob("src/map/**")).toBe(true);
  expect(staticPrefix("src/map/**")).toBe("src/map");
  expect(matches("src/map/**", "src/map/a.ts")).toBe(true);
  expect(matches("src/map/**", "src/map/b/c.ts")).toBe(true);
  expect(matches("src/map/**", "src/mapper.ts")).toBe(false);
  expect(staticPrefix("src/*.ts")).toBe("src");
  expect(staticPrefix("**/x.ts")).toBe("");
});

test("R1, R2, C1: a plain path is no glob, its prefix its directory, and matches only itself; nothing reads the disk", () => {
  expect(isGlob("src/bin.ts")).toBe(false);
  expect(staticPrefix("src/bin.ts")).toBe("src");
  expect(staticPrefix("bin.ts")).toBe("");
  expect(matches("src/bin.ts", "src/bin.ts")).toBe(true);
  expect(matches("src/bin.ts", "src/bin.tsx")).toBe(false);
  // Paths that exist nowhere are answered all the same: nothing looks at the disk.
  expect(matches("nowhere/**/*.ts", "nowhere/deep/x.ts")).toBe(true);
});

test("R2: each glob character makes a glob", () => {
  for (const entry of ["a*", "a?", "a[b]", "{a,b}", "!a", "a\\b"]) expect(isGlob(entry)).toBe(true);
  expect(staticPrefix("src/{a,b}/x.ts")).toBe("src");
});
