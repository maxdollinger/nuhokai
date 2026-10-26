import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../init/scaffold.ts";
import { runMap } from "./draw-map.ts";

const MAP = "nuhokai/.generated/map.html";
const roots: string[] = [];

// Every test gets its own repo: Bun caches a world module by path for the whole process.
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-map-test-"));
  roots.push(dir);
  return dir;
}

function gitRepo(): string {
  const dir = tempDir();
  const result = Bun.spawnSync(["git", "init", "-q", dir], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git init failed: ${result.stderr}`);
  return dir;
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, environment: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) } };
}

/** Every file in the repo but .git, with its bytes. */
function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
      .filter((path) => !path.startsWith(".git"))
      .sort()
      .map((path) => [path, readFileSync(join(dir, path), "utf8")]),
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("after init, map writes and prints the map; a second run changes no other file", async () => {
  const repo = gitRepo();
  expect(await runInit(repo, capture().environment)).toBe(0);
  const before = snapshot(repo);
  const output = capture();

  expect(await runMap(repo, output.environment)).toBe(0);
  expect(output.out).toEqual([MAP]);
  expect(output.err).toEqual([]);
  const after = snapshot(repo);
  expect(Object.keys(after)).toEqual([...Object.keys(before), MAP].sort());
  expect(after[MAP]).toContain('"name":"Example"');

  const again = capture();
  expect(await runMap(join(repo, "nuhokai"), again.environment)).toBe(0);
  expect(again.out).toEqual([MAP]);
  expect(snapshot(repo)).toEqual(after);
});

test("an orphan and an out-of-scope uses edge still get a map", async () => {
  const repo = gitRepo();
  expect(await runInit(repo, capture().environment)).toBe(0);
  writeFileSync(
    join(repo, "nuhokai/orphan.ts"),
    `import { node } from "@nuhokai/world";
import { Example } from "./example.ts";

export const Inner = node({ id: "inner", purpose: "i", status: "planned", source: [], ports: { x: { kind: "call", purpose: "x" } } }).edges({});
export const Box = node({ id: "box", purpose: "b", status: "planned", source: [], children: { inner: Inner }, ports: () => ({}) }).edges({});
// Out of scope: Inner sits inside Box's dome. Not in the world: an orphan.
export const Orphan = node({ id: "orphan", purpose: "o", status: "planned", source: [] }).edges({ uses: () => [Inner.x, Example.greet] });
`,
  );
  writeFileSync(
    join(repo, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { Example } from "./example.ts";
import { Box } from "./orphan.ts";

export default defineWorld({ children: [Example, Box] });
`,
  );
  const output = capture();

  expect(await runMap(repo, output.environment)).toBe(0);
  expect(output.out).toEqual([MAP]);
  expect(readFileSync(join(repo, MAP), "utf8")).toContain('"name":"Box"');
});

test("no world, or a file at nuhokai: one stderr line, exit 1, nothing written", async () => {
  const empty = gitRepo();
  const output = capture();

  expect(await runMap(empty, output.environment)).toBe(1);
  expect(output.out).toEqual([]);
  expect(output.err).toEqual(["nuhokai map: no world at nuhokai/; run `nuhokai init` first"]);
  expect(snapshot(empty)).toEqual({});

  const occupied = gitRepo();
  writeFileSync(join(occupied, "nuhokai"), "in the way\n");
  const second = capture();

  expect(await runMap(occupied, second.environment)).toBe(1);
  expect(second.out).toEqual([]);
  expect(second.err).toEqual(["nuhokai map: nuhokai exists but is not a directory"]);
  expect(snapshot(occupied)).toEqual({ nuhokai: "in the way\n" });
});

test("without git and without a terminal it is one error and nothing is written", async () => {
  const dir = tempDir();
  const output = capture();

  expect(await runMap(dir, { ...output.environment, gitRoot: () => null, isTTY: false })).toBe(1);
  expect(output.err).toHaveLength(1);
  expect(output.err[0]).toStartWith("nuhokai map: no Git repository");
  expect(snapshot(dir)).toEqual({});
});

test("a throwing node file: one line naming the file, exit 1, the previous map kept", async () => {
  const repo = gitRepo();
  expect(await runInit(repo, capture().environment)).toBe(0);
  expect(await runMap(repo, capture().environment)).toBe(0);
  const map = readFileSync(join(repo, MAP), "utf8");
  writeFileSync(join(repo, "nuhokai/orders.ts"), 'throw new Error("orders\\nbroke");\n');
  const output = capture();

  expect(await runMap(repo, output.environment)).toBe(1);
  expect(output.out).toEqual([]);
  expect(output.err).toEqual(["nuhokai map: nuhokai/orders.ts: orders broke"]);
  expect(readFileSync(join(repo, MAP), "utf8")).toBe(map);
});
