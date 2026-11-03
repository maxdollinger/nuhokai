import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runTree } from "./print-tree.ts";

const EXAMPLE = join(import.meta.dir, "../../../world/example");
const roots: string[] = [];

// Every test gets its own directory: Bun caches a world module by path for the whole process.
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-tree-test-"));
  roots.push(dir);
  return dir;
}

/** packages/world/example as a repo's world, plus these files by path inside nuhokai/. */
function exampleWorld(extra: Record<string, string> = {}): string {
  const root = tempDir();
  const files: Record<string, string> = { ...extra };
  for (const file of readdirSync(EXAMPLE)) {
    if (file.endsWith(".test.ts") || file === "type-errors.ts") continue;
    files[file] = readFileSync(join(EXAMPLE, file), "utf8").replaceAll('"../src/index.ts"', '"@nuhokai/world"');
  }
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, "nuhokai", path)), { recursive: true });
    writeFileSync(join(root, "nuhokai", path), source);
  }
  return root;
}

async function tree(root: string, node?: string, level = 1) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runTree(root, node, level, {
    out: (line) => out.push(line),
    err: (line) => err.push(line.replaceAll(root, "<root>")),
  });
  return { code, out, err };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("Tree R1, R2: the example world's top level, one line per node, Shop collapsed", async () => {
  const result = await tree(exampleWorld());
  expect(result).toEqual({
    code: 0,
    out: [
      "Postgres | (none) | The shared database; run by ops, not built by us.",
      "AuditLog | (none) | Lets compliance read who changed what, independent of the owning node.",
      "Shop/ (2) | (none) | The shop backend; everything a customer interacts with lives inside it.",
    ],
    err: [],
  });
});

test("Tree R1, NodePath R3: a start node and its children; a collapsed dome's path is accepted as printed", async () => {
  const root = exampleWorld();
  const paths = (await tree(root, "Shop/")).out.map((line) => line.split(" | ")[0]);
  expect(paths).toEqual(["Shop", "Shop/Orders", "Shop/Stock"]);
});

test("PrintTree R2: no world, or a file at nuhokai, is one stderr line, exit 1, no stdout", async () => {
  const empty = tempDir();
  expect(await tree(empty)).toEqual({
    code: 1,
    out: [],
    err: ["nuhokai tree: no nuhokai/ in <root>; run `nuhokai init --path <root>` to start a world there"],
  });
  const occupied = tempDir();
  writeFileSync(join(occupied, "nuhokai"), "not a world");
  expect(await tree(occupied)).toEqual({
    code: 1,
    out: [],
    err: ["nuhokai tree: <root>/nuhokai exists but is not a directory"],
  });
});

test("PrintTree R1, R3: a node file that does not parse is one line naming it, exit 1; a path naming no node exits 2", async () => {
  const broken = exampleWorld({ "boom.ts": "export const boom = ;\n" });
  const failed = await tree(broken);
  expect(failed.code).toBe(1);
  expect(failed.out).toEqual([]);
  expect(failed.err).toHaveLength(1);
  expect(failed.err[0]).toStartWith("nuhokai tree: <root>/nuhokai/boom.ts");

  const example = exampleWorld();
  expect(await tree(example, "Shop/Basket")).toEqual({
    code: 2,
    out: [],
    err: ["nuhokai tree: no node 'Shop/Basket'; `nuhokai tree Shop --path <root>` lists its children"],
  });
  expect(await tree(example, "Shop/Stok")).toEqual({
    code: 2,
    out: [],
    err: ["nuhokai tree: no node 'Shop/Stok'; did you mean 'Shop/Stock'?"],
  });
});

test("Tree R3: siblings sharing a name both print; addressing them names nuhokai check", async () => {
  const twin = (id: string) =>
    `import { node } from "@nuhokai/world";\nexport const Twin = node({ id: "${id}", purpose: "twin ${id}", status: "planned", source: [], ports: {} }).edges({});\n`;
  const root = tempDir();
  const files: Record<string, string> = {
    "a/twin.ts": twin("a"),
    "b/twin.ts": twin("b"),
    "index.ts": `import { defineWorld } from "@nuhokai/world";\nimport { Twin as A } from "./a/twin.ts";\nimport { Twin as B } from "./b/twin.ts";\nexport default defineWorld({ id: "w", name: "W", source: [], children: [A, B] });\n`,
  };
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, "nuhokai", path)), { recursive: true });
    writeFileSync(join(root, "nuhokai", path), source);
  }
  expect(await tree(root)).toEqual({
    code: 0,
    out: ["Twin | (none) | twin a", "Twin | (none) | twin b"],
    err: [],
  });
  expect(await tree(root, "Twin")).toEqual({
    code: 2,
    out: [],
    err: ["nuhokai tree: 'Twin' names 2 siblings; `nuhokai check --path <root>` reports the clash"],
  });
});
