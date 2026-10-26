import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CliError } from "../shared/failure.ts";
import { createNodeFile, nodeFileSource } from "./node-file.ts";

const ID = "01a17950-b221-7124-8356-08fd2fee0888";
const OTHER_ID = "01a17950-b221-7127-8c31-2d5e6f708192";
const roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-new-test-"));
  roots.push(dir);
  return dir;
}

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (entry.isDirectory()) chmodSync(join(entry.parentPath, entry.name), 0o700);
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("a new absolute path with missing parents gets the templated bytes", () => {
  const dir = tempDir();
  const path = join(dir, "nuhokai", "new", "stock-order.ts");

  expect(createNodeFile(path, "StockOrder", ID)).toBe(path);
  expect(files(dir)).toEqual(["nuhokai/new/stock-order.ts"]);
  expect(readFileSync(path, "utf8")).toBe(nodeFileSource("StockOrder", ID));

  const source = readFileSync(path, "utf8");
  expect(source).toContain('import { node } from "@nuhokai/world";');
  expect(source).toContain("export const StockOrder = node({");
  expect(source).toContain(`id: "${ID}"`);
  expect(source).toContain('status: "planned"');
  expect(source).toContain("source: []");
  expect(source.endsWith("});\n")).toBe(true);
  expect(source).not.toContain("\r");
});

test("the same name and id give identical bytes; a different id changes one line", () => {
  const first = tempDir();
  const second = tempDir();

  createNodeFile(join(first, "nuhokai", "stock-order.ts"), "StockOrder", ID);
  createNodeFile(join(second, "nuhokai", "stock-order.ts"), "StockOrder", ID);
  expect(readFileSync(join(second, "nuhokai", "stock-order.ts"))).toEqual(
    readFileSync(join(first, "nuhokai", "stock-order.ts")),
  );

  createNodeFile(join(second, "other.ts"), "StockOrder", OTHER_ID);
  const changed = readFileSync(join(second, "other.ts"), "utf8")
    .split("\n")
    .filter((line, index) => line !== nodeFileSource("StockOrder", ID).split("\n")[index]);
  expect(changed).toEqual([`  id: "${OTHER_ID}",`]);
});

test("the written file loads as one planned leaf with a run call port", async () => {
  const dir = tempDir();
  const path = join(dir, "nuhokai", "new", "stock-order.ts");
  mkdirSync(join(dir, "node_modules/@nuhokai"), { recursive: true });
  const worldPackage = join(import.meta.dir, "../../../world");
  Bun.spawnSync(["ln", "-s", worldPackage, join(dir, "node_modules/@nuhokai/world")]);

  createNodeFile(path, "StockOrder", ID);
  const node = (await import(pathToFileURL(path).href)).StockOrder;

  expect(node.$ref).toBe("node");
  expect(node.$def.id).toBe(ID);
  expect(node.$def.status).toBe("planned");
  expect(node.$def.source).toEqual([]);
  expect(Object.keys(node.$def.ports)).toEqual(["run"]);
  expect(node.$def.ports.run).toMatchObject({ kind: "call" });
  for (const shape of [node.$def.ports.run.purpose, node.$def.ports.run.input, node.$def.ports.run.output]) {
    expect(shape.startsWith("TODO:")).toBe(true);
  }
  expect(node.$def.uses).toBeUndefined();
});

test("an existing file is one error and keeps its bytes", () => {
  const dir = tempDir();
  const path = join(dir, "nuhokai", "stock-order.ts");
  mkdirSync(join(dir, "nuhokai"));
  writeFileSync(path, "// authored by hand\n");

  expect(() => createNodeFile(path, "StockOrder", ID)).toThrow(CliError);
  expect(readFileSync(path, "utf8")).toBe("// authored by hand\n");
});

test("an existing directory at the path is one error", () => {
  const dir = tempDir();
  const path = join(dir, "nuhokai", "stock-order.ts");
  mkdirSync(path, { recursive: true });

  expect(() => createNodeFile(path, "StockOrder", ID)).toThrow(CliError);
  expect(readdirSync(path)).toEqual([]);
});

test("a name or id that cannot be in the bytes is a bug and writes nothing", () => {
  const dir = tempDir();
  const path = join(dir, "nuhokai", "new", "stock-order.ts");

  expect(() => createNodeFile(path, "stock-order", ID)).toThrow(TypeError);
  expect(() => createNodeFile(path, "Stock Order", ID)).toThrow(TypeError);
  expect(() => createNodeFile(path, `Stock"Order`, ID)).toThrow(TypeError);
  expect(() => createNodeFile(path, "StockOrder", "not-a-uuid")).toThrow(TypeError);
  expect(() => createNodeFile(path, "StockOrder", `${ID}"`)).toThrow(TypeError);
  expect(() => nodeFileSource(`St"ockOrder`, ID)).toThrow(TypeError);

  expect(existsSync(join(dir, "nuhokai"))).toBe(false);
});

test.skipIf(process.getuid?.() === 0)("a failed write leaves no partial file", () => {
  const dir = tempDir();
  const folder = join(dir, "nuhokai", "new");
  mkdirSync(folder, { recursive: true });
  chmodSync(folder, 0o500);

  expect(() => createNodeFile(join(folder, "stock-order.ts"), "StockOrder", ID)).toThrow();
  expect(existsSync(join(folder, "stock-order.ts"))).toBe(false);
});
