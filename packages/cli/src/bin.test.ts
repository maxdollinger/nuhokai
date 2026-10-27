import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMANDS, commandUsage, main, usage } from "./bin.ts";
import { runInit } from "./init/index.ts";

test("usage lists every command", () => {
  for (const command of COMMANDS) expect(usage()).toContain(command);
});

test("--help exits 0", async () => {
  expect(await main(["--help"])).toBe(0);
});

test("no argument prints usage on stdout and exits 0", async () => {
  const lines: string[] = [];
  const log = console.log;
  console.log = (line: string) => lines.push(line);
  try {
    expect(await main([])).toBe(0);
  } finally {
    console.log = log;
  }
  expect(lines.join("\n")).toBe(usage());
});

test("an empty-string argument is an unknown command on stderr", async () => {
  const lines: string[] = [];
  const error = console.error;
  console.error = (line: string) => lines.push(line);
  try {
    expect(await main([""])).toBe(2);
  } finally {
    console.error = error;
  }
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("unknown command");
});

test("a help word does not excuse an unexpected argument", async () => {
  expect(await main(["init", "--help", "junk"])).toBe(2);
});

test("`nuhokai init --help` prints init's help and exits 0", async () => {
  expect(await main(["init", "--help"])).toBe(0);
  expect(commandUsage("init")).toContain("Usage: nuhokai init");
});

test("`nuhokai new --help` shows that new takes a path", async () => {
  expect(await main(["new", "--help"])).toBe(0);
  expect(commandUsage("new")).toContain("Usage: nuhokai new <path>");
});

test("Cli enforces the argument count without validating the argument", async () => {
  expect(await main(["new"])).toBe(2);
  expect(await main(["new", "a", "b"])).toBe(2);
  // The count is the dispatcher's; the value is New's, which rejects this one with its own 2.
  expect(await main(["new", "new/StockOrder"])).toBe(2);
  expect(await main(["init", "extra"])).toBe(2);
});

test("an unknown command is a usage error", async () => {
  expect(await main(["bogus"])).toBe(2);
});

test("`nuhokai map --help` shows that map takes no argument", async () => {
  expect(await main(["map", "--help"])).toBe(0);
  expect(commandUsage("map")).toContain("Usage: nuhokai map\n");
});

test("`nuhokai map` runs WorldMap with the cwd; `nuhokai map x` is an argument error and WorldMap never runs", async () => {
  const repo = mkdtempSync(join(tmpdir(), "nuhokai-bin-map-test-"));
  const cwd = process.cwd();
  const log = console.log;
  const error = console.error;
  const out: string[] = [];
  try {
    expect(await runInit(repo, { out: () => {} })).toBe(0);
    console.log = (line: string) => out.push(line);
    console.error = () => {};
    process.chdir(repo);

    expect(await main(["map", "x"])).toBe(2);
    expect(existsSync(join(repo, "nuhokai/.generated/map.html"))).toBe(false);
    expect(await main(["map"])).toBe(0);
  } finally {
    process.chdir(cwd);
    console.log = log;
    console.error = error;
    rmSync(repo, { recursive: true, force: true });
  }
  expect(out).toEqual(["nuhokai/.generated/map.html"]);
});

test("--path names the project directory, against the cwd; without it the cwd is the directory", async () => {
  const parent = mkdtempSync(join(tmpdir(), "nuhokai-bin-path-test-"));
  const project = join(parent, "packages", "app");
  mkdirSync(project, { recursive: true });
  const cwd = process.cwd();
  const log = console.log;
  const error = console.error;
  const out: string[] = [];
  const err: string[] = [];
  try {
    console.log = (line: string) => out.push(line);
    console.error = (line: string) => err.push(line);
    process.chdir(parent);

    expect(await main(["map"])).toBe(1);
    expect(err[0]).toStartWith(`nuhokai map: no nuhokai/ in ${parent}`);
    expect(await main(["init", "--path", "packages/app"])).toBe(0);
    expect(existsSync(join(project, "nuhokai/index.ts"))).toBe(true);
    expect(existsSync(join(parent, "nuhokai"))).toBe(false);
    expect(await main(["map", "--path=packages/app"])).toBe(0);
    expect(existsSync(join(project, "nuhokai/.generated/map.html"))).toBe(true);
  } finally {
    process.chdir(cwd);
    console.log = log;
    console.error = error;
    rmSync(parent, { recursive: true, force: true });
  }
});

test("a --path without a value, given twice or not a directory is a usage error and nothing runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-bin-path-test-"));
  const error = console.error;
  const err: string[] = [];
  try {
    console.error = (line: string) => err.push(line);
    expect(await main(["init", "--path"])).toBe(2);
    expect(await main(["init", "--path", dir, "--path", dir])).toBe(2);
    expect(await main(["init", "--path", join(dir, "missing")])).toBe(2);
    expect(await main(["new", "a", "--path"])).toBe(2);
  } finally {
    console.error = error;
  }
  expect(err.map((line) => line.split("\n")[0])).toEqual([
    "nuhokai init: --path needs a directory",
    "nuhokai init: --path given twice",
    `nuhokai init: not a directory: ${join(dir, "missing")}`,
    "nuhokai new: --path needs a directory",
  ]);
  expect(readdirSync(dir)).toEqual([]);
  rmSync(dir, { recursive: true, force: true });
});
