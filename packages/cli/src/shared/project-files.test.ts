import { afterEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
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

test("R1: a link to a file inside counts; one leading out is nothing; a link to a directory is not listed through", () => {
  const outside = project({ x: "secret" });
  const root = project({ "src/a.ts": "", "lib/b.ts": "" });
  symlinkSync(join(outside, "x"), join(root, "src/out.ts"));
  symlinkSync(join(root, "lib/b.ts"), join(root, "src/b.ts"));
  symlinkSync(join(root, "lib"), join(root, "src/lib"));
  symlinkSync(join(root, "src"), join(root, "src/loop"));
  const files = new ProjectFiles(root);
  expect(files.expand("src/**")).toEqual(["src/a.ts", "src/b.ts"]);
  expect(files.expand("src/out.ts")).toEqual([]);
  // A plain path through a linked directory is a file; a glob below one matches nothing.
  expect(files.expand("src/lib/b.ts")).toEqual(["src/lib/b.ts"]);
  expect(files.expand("src/lib/**")).toEqual([]);
  expect(files.expand("gone/**")).toEqual([]);
});

test("R2: an entry is normalized, then a plain path if a file is there, a glob what it matches; outside is undefined", () => {
  const root = project({ "src/a.ts": "", "src/b/c.ts": "", "src/b/d.md": "", "src.ts": "" });
  const files = new ProjectFiles(root);
  for (const entry of ["src/a.ts", "./src/a.ts", "src//a.ts", "src/./a.ts", "src/../src/a.ts"]) {
    expect(files.expand(entry)).toEqual(["src/a.ts"]);
  }
  expect(files.expand("src/**/*.ts")).toEqual(["src/a.ts", "src/b/c.ts"]);
  expect(files.expand("**/*.ts")).toEqual(["src.ts", "src/a.ts", "src/b/c.ts"]);
  for (const entry of ["src/gone.ts", "src/b", "src/b/", "", "."]) expect(files.expand(entry)).toEqual([]);
  for (const entry of ["../x/a.ts", "src/../../x", join(root, "src/a.ts")]) {
    expect(files.expand(entry)).toBeUndefined();
  }
});

test("R1: a glob never matches inside .git or node_modules, even through **; a plain path there still names its file", () => {
  const root = project({
    "a.ts": "",
    "src/b.ts": "",
    ".git/hooks/c.ts": "",
    "node_modules/pkg/d.ts": "",
    "src/node_modules/e.ts": "",
    ".hidden/f.ts": "",
  });
  const files = new ProjectFiles(root);
  expect(files.expand("**/*.ts")).toEqual([".hidden/f.ts", "a.ts", "src/b.ts"]);
  expect(files.expand("node_modules/**")).toEqual([]);
  expect(files.expand("node_modules/pkg/d.ts")).toEqual(["node_modules/pkg/d.ts"]);
});

test("R2: a glob without ** reads only as deep as its segments reach", () => {
  const root = project({ "a.md": "", "src/b.md": "", "src/deep/c.md": "", "src/deep/deeper/d.md": "" });
  const read: string[] = [];
  const files = new ProjectFiles(root);
  const spy = spyOn(fs, "readdirSync");
  try {
    expect(files.expand("*.md")).toEqual(["a.md"]);
    expect(files.expand("src/*/*.md")).toEqual(["src/deep/c.md"]);
    expect(files.expand("src/**/*.md")).toEqual(["src/b.md", "src/deep/c.md", "src/deep/deeper/d.md"]);
    for (const [path] of spy.mock.calls) read.push(String(path).slice(root.length));
  } finally {
    spy.mockRestore();
  }
  // *.md lists the root alone; src/*/*.md stops at src/deep; only ** reaches src/deep/deeper.
  expect(read).toEqual(["", "/src", "/src/deep", "/src/deep/deeper"]);
});

test("isDirectory: a directory inside the project; a file, a missing path or one outside is not", () => {
  const outside = project({ "x/y": "" });
  const root = project({ "src/a.ts": "" });
  symlinkSync(join(outside, "x"), join(root, "out"));
  const files = new ProjectFiles(root);
  expect(files.isDirectory("src")).toBe(true);
  expect(files.isDirectory("./src/")).toBe(true);
  expect(files.isDirectory("src/a.ts")).toBe(false);
  expect(files.isDirectory("gone")).toBe(false);
  expect(files.isDirectory("out")).toBe(false);
});
