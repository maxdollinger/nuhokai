import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectFiles } from "./project-files.ts";

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A temporary directory holding `files` (relative path → content). */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "nuhokai-project-files-"));
  made.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test("R1: a symlink out of the project directory is nothing there; one to its own parent never hangs", () => {
  const outside = project({ x: "secret", "y/z.ts": "" });
  const root = project({ "src/a.ts": "", "src/b/c.ts": "" });
  symlinkSync(outside, join(root, "src/out"));
  symlinkSync(join(root, "src"), join(root, "src/loop"));
  const files = new ProjectFiles(root);
  expect(files.list("src")).toEqual(["src/a.ts", "src/b/c.ts"]);
  expect(files.isFile("src/out/x")).toBe(false);
  expect(files.isFile("src/a.ts")).toBe(true);
  expect(files.isFile("src/b")).toBe(false);
  expect(files.isFile("../x")).toBe(false);
});

test("R1: a symlink inside is followed; a missing directory lists nothing; '' lists the project", () => {
  const root = project({ "lib/a.ts": "", "src/x.ts": "", "a.ts": "" });
  symlinkSync(join(root, "lib"), join(root, "src/lib"));
  symlinkSync(join(root, "a.ts"), join(root, "src/linked.ts"));
  const files = new ProjectFiles(root);
  expect(files.list("src")).toEqual(["src/lib/a.ts", "src/linked.ts", "src/x.ts"]);
  expect(files.list("gone")).toEqual([]);
  expect(files.list("a.ts")).toEqual([]);
  expect(new ProjectFiles(root).list("")).toEqual(["a.ts", "lib/a.ts", "src/lib/a.ts", "src/linked.ts", "src/x.ts"]);
});

test("R2: listing src twice and src/b once reads src once", () => {
  const root = project({ "src/a.ts": "", "src/b/c.ts": "" });
  const files = new ProjectFiles(root);
  expect(files.list("src")).toEqual(["src/a.ts", "src/b/c.ts"]);
  // Gone from the disk, the directories are still answered from the one read.
  rmSync(join(root, "src"), { recursive: true });
  expect(files.list("src")).toEqual(["src/a.ts", "src/b/c.ts"]);
  expect(files.list("src/b")).toEqual(["src/b/c.ts"]);
  expect(new ProjectFiles(root).list("src")).toEqual([]);
});
