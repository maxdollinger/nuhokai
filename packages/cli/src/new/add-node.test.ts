import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInit } from "../init/scaffold.ts";
import { runNew } from "./add-node.ts";

const TSC = join(import.meta.dir, "../../../../node_modules/.bin/tsc");
const INIT_FILES = [
  "nuhokai/.generated/world/index.d.ts",
  "nuhokai/example.ts",
  "nuhokai/index.ts",
  "nuhokai/tsconfig.json",
];
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-new-test-"));
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

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .filter((path) => !path.startsWith(".git"))
    .sort();
}

function idOf(dir: string, path: string): string {
  const match = readFileSync(join(dir, path), "utf8").match(/^ {2}id: "([^"]+)",$/m);
  return match?.[1] ?? "";
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("an invalid path exits 2 with one line and writes nothing", async () => {
  const dir = tempDir();

  for (const argument of [
    "new/StockOrder",
    "new//stock-order",
    "../escape",
    "/abs",
    "new/index",
    "new/stock-order.ts",
    "",
  ]) {
    const output = capture();
    const code = await runNew(dir, argument, output.environment);

    expect(code).toBe(2);
    expect(output.out).toEqual([]);
    expect(output.err).toHaveLength(1);
    expect(output.err[0]?.startsWith("nuhokai new: invalid path")).toBe(true);
  }
  expect(readdirSync(dir)).toEqual([]);
});

test("new writes one node file and names index.ts, which type-checks", async () => {
  const repo = gitRepo();
  expect(await runInit(repo, capture().environment)).toBe(0);
  const output = capture();

  expect(await runNew(repo, "new/stock-order", output.environment)).toBe(0);
  expect(output.err).toEqual([]);
  expect(output.out).toEqual(["nuhokai/new/stock-order.ts", "next: add it to nuhokai/index.ts"]);
  expect(files(repo)).toEqual([...INIT_FILES, "nuhokai/new/stock-order.ts"].sort());

  const source = readFileSync(join(repo, "nuhokai/new/stock-order.ts"), "utf8");
  expect(source).toContain("export const StockOrder = node({");
  expect(idOf(repo, "nuhokai/new/stock-order.ts")).toMatch(UUIDV7);

  const result = Bun.spawnSync([TSC, "-p", join(repo, "nuhokai/tsconfig.json"), "--pretty", "false"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(`${result.stdout}${result.stderr}`).toBe("");
  expect(result.exitCode).toBe(0);
});

test("the written file loads as one planned leaf", async () => {
  const repo = gitRepo();
  expect(await runInit(repo, capture().environment)).toBe(0);
  expect(await runNew(repo, "stock-order", capture().environment)).toBe(0);

  mkdirSync(join(repo, "node_modules/@nuhokai"), { recursive: true });
  symlinkSync(join(import.meta.dir, "../../../world"), join(repo, "node_modules/@nuhokai/world"), "dir");

  const node = (await import(pathToFileURL(join(repo, "nuhokai/stock-order.ts")).href)).StockOrder;
  expect(node.$ref).toBe("node");
  expect(node.$def.status).toBe("planned");
  expect(Object.keys(node.$def.ports)).toEqual(["run"]);
});

test("two runs get different ids", async () => {
  const repo = gitRepo();
  expect(await runInit(repo, capture().environment)).toBe(0);

  expect(await runNew(repo, "stock", capture().environment)).toBe(0);
  expect(await runNew(repo, "order", capture().environment)).toBe(0);

  const first = idOf(repo, "nuhokai/stock.ts");
  expect(first).toMatch(UUIDV7);
  expect(idOf(repo, "nuhokai/order.ts")).not.toBe(first);
});

test("an existing path writes nothing and is one error line", async () => {
  const repo = gitRepo();
  expect(await runInit(repo, capture().environment)).toBe(0);
  expect(await runNew(repo, "stock-order", capture().environment)).toBe(0);
  const before = files(repo);
  const bytes = readFileSync(join(repo, "nuhokai/stock-order.ts"), "utf8");
  const output = capture();

  expect(await runNew(repo, "stock-order", output.environment)).toBe(1);
  expect(output.out).toEqual([]);
  expect(output.err).toHaveLength(1);
  expect(output.err[0]?.startsWith("nuhokai new: ")).toBe(true);
  expect(output.err[0]).toContain("already exists");
  expect(files(repo)).toEqual(before);
  expect(readFileSync(join(repo, "nuhokai/stock-order.ts"), "utf8")).toBe(bytes);
});

test("without a world it is one error naming init and nothing is written", async () => {
  const repo = gitRepo();
  const output = capture();

  expect(await runNew(repo, "stock-order", output.environment)).toBe(1);
  expect(output.out).toEqual([]);
  expect(output.err).toHaveLength(1);
  expect(output.err[0]).toContain("init");
  expect(files(repo)).toEqual([]);
});

test("a file at nuhokai/ is occupied and nothing is written", async () => {
  const repo = gitRepo();
  writeFileSync(join(repo, "nuhokai"), "in the way\n");
  const output = capture();

  expect(await runNew(repo, "stock-order", output.environment)).toBe(1);
  expect(output.err).toHaveLength(1);
  expect(files(repo)).toEqual(["nuhokai"]);
  expect(existsSync(join(repo, "nuhokai/stock-order.ts"))).toBe(false);
});
