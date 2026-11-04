import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectFiles } from "./project-files.ts";

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) {
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
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
  expect(files.list("src")).toEqual({ files: ["src/a.ts", "src/b/c.ts"], unreadable: [] });
  expect(files.isFile("src/out/x")).toBe(false);
  expect(files.isFile("src/a.ts")).toBe(true);
  expect(files.isFile("src/b")).toBe(false);
  expect(files.isFile("../x")).toBe(false);
});

test("R1: a symlink inside is followed unless the walk already reached its directory; a missing directory lists nothing", () => {
  const root = project({ "lib/a.ts": "", "src/x.ts": "", "a.ts": "" });
  symlinkSync(join(root, "lib"), join(root, "src/lib"));
  symlinkSync(join(root, "a.ts"), join(root, "src/linked.ts"));
  const files = new ProjectFiles(root);
  expect(files.list("src").files).toEqual(["src/lib/a.ts", "src/linked.ts", "src/x.ts"]);
  expect(files.list("gone").files).toEqual([]);
  expect(files.list("a.ts").files).toEqual([]);
  // From the project directory, lib is reached first as lib: src/lib adds nothing more.
  expect(new ProjectFiles(root).list("").files).toEqual(["a.ts", "lib/a.ts", "src/linked.ts", "src/x.ts"]);
});

test("R1: a mesh of links, every directory linking to every other, lists each directory once and ends at once", () => {
  const names = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"];
  const root = project(Object.fromEntries(names.map((name) => [`${name}/f.ts`, ""])));
  for (const from of names) {
    for (const to of names) if (from !== to) symlinkSync(join(root, to), join(root, from, `to-${to}`));
  }
  const started = performance.now();
  expect(new ProjectFiles(root).list("").files).toEqual(names.map((name) => `${name}/f.ts`));
  expect(new ProjectFiles(root).list("d1").files).toEqual([
    "d1/f.ts",
    ...names.slice(1).map((name) => `d1/to-${name}/f.ts`),
  ]);
  expect(performance.now() - started).toBeLessThan(1000);
});

test("R2: listing src twice and src/b once reads src once", () => {
  const root = project({ "src/a.ts": "", "src/b/c.ts": "" });
  const files = new ProjectFiles(root);
  expect(files.list("src").files).toEqual(["src/a.ts", "src/b/c.ts"]);
  // Gone from the disk, the directories are still answered from the one read.
  rmSync(join(root, "src"), { recursive: true });
  expect(files.list("src").files).toEqual(["src/a.ts", "src/b/c.ts"]);
  expect(files.list("src/b").files).toEqual(["src/b/c.ts"]);
  expect(new ProjectFiles(root).list("src").files).toEqual([]);
});

test("R2: an answer never depends on what was asked before", () => {
  const root = project({ "a/x.ts": "", "b/y.ts": "" });
  symlinkSync(join(root, "b"), join(root, "a/l"));
  symlinkSync(join(root, "a"), join(root, "b/m"));
  const warm = new ProjectFiles(root);
  warm.list("");
  for (const dir of ["a", "a/l", "b", "b/m"]) expect(warm.list(dir)).toEqual(new ProjectFiles(root).list(dir));
  expect(warm.list("a/l").files).toEqual(["a/l/m/x.ts", "a/l/y.ts"]);
});

test.skipIf(process.getuid?.() === 0)(
  "R3: a directory that cannot be read is listed as unreadable; the rest still are",
  () => {
    const root = project({ "src/a.ts": "", "src/secret/b.ts": "" });
    chmodSync(join(root, "src/secret"), 0o000);
    made.unshift(join(root, "src/secret"));
    const files = new ProjectFiles(root);
    expect(files.list("src")).toEqual({ files: ["src/a.ts"], unreadable: [{ dir: "src/secret", code: "EACCES" }] });
    expect(files.expand("src/**/*.ts")).toEqual({
      files: ["src/a.ts"],
      unreadable: [{ dir: "src/secret", code: "EACCES" }],
    });
  },
);

test("R4: an entry's files: a plain path if a file is there, a glob what it matches; .. and absolute entries refused", () => {
  const root = project({ "src/a.ts": "", "src/b/c.ts": "", "src/b/d.md": "" });
  const files = new ProjectFiles(root);
  expect(files.expand("src/a.ts")).toEqual({ files: ["src/a.ts"], unreadable: [] });
  expect(files.expand("./src/a.ts")).toEqual({ files: ["src/a.ts"], unreadable: [] });
  expect(files.expand("src/gone.ts")).toEqual({ files: [], unreadable: [] });
  expect(files.expand("src/**/*.ts")).toEqual({ files: ["src/a.ts", "src/b/c.ts"], unreadable: [] });
  expect(files.expand("src/../src/a.ts")).toEqual({ refused: "climbs" });
  expect(files.expand("../x/a.ts")).toEqual({ refused: "outside" });
  expect(files.expand(join(root, "src/a.ts"))).toEqual({ refused: "outside" });
});

test("R5: two names of one file through a symlink share its real path; a directory or a missing file has none", () => {
  const root = project({ "lib/a.ts": "" });
  mkdirSync(join(root, "src"));
  symlinkSync("../lib", join(root, "src/lib"));
  const files = new ProjectFiles(root);
  expect(files.realPath("src/lib/a.ts")).toBe(files.realPath("lib/a.ts"));
  expect(files.realPath("lib/a.ts")).toBeString();
  expect(files.realPath("src/lib")).toBeUndefined();
  expect(files.realPath("src/gone.ts")).toBeUndefined();
});
