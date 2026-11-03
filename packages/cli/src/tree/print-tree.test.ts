import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type SplitReport, splitReport } from "../shared/split-report.ts";
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

/** Run tree: its outcome and its result and failure lines, the project directory written as <root>. */
async function tree(root: string, node?: string, level = 1): Promise<SplitReport> {
  return splitReport(await runTree(root, node, level), root);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("Tree R1, R2: the example world's top level, one line per node, Shop collapsed", async () => {
  const result = await tree(exampleWorld());
  expect(result).toEqual({
    outcome: "ok",
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

test("PrintTree R2: no world, or a file at nuhokai, is one failure line, failed, no result line", async () => {
  const empty = tempDir();
  expect(await tree(empty)).toEqual({
    outcome: "failed",
    out: [],
    err: ["no nuhokai/ in <root>; run `nuhokai init --path <root>` to start a world there"],
  });
  const occupied = tempDir();
  writeFileSync(join(occupied, "nuhokai"), "not a world");
  expect(await tree(occupied)).toEqual({
    outcome: "failed",
    out: [],
    err: ["<root>/nuhokai exists but is not a directory"],
  });
});

test("PrintTree R1, R3: a node file that does not parse is one failure line naming it, failed; a path naming no node is invalid", async () => {
  const broken = exampleWorld({ "boom.ts": "export const boom = ;\n" });
  const failed = await tree(broken);
  expect(failed.outcome).toBe("failed");
  expect(failed.out).toEqual([]);
  expect(failed.err).toHaveLength(1);
  expect(failed.err[0]).toStartWith("<root>/nuhokai/boom.ts");

  const example = exampleWorld();
  expect(await tree(example, "Shop/Basket")).toEqual({
    outcome: "invalid",
    out: [],
    err: ["no node 'Shop/Basket'; `nuhokai tree Shop --path <root>` lists its children"],
  });
  expect(await tree(example, "Shop/Stok")).toEqual({
    outcome: "invalid",
    out: [],
    err: ["no node 'Shop/Stok'; did you mean `nuhokai tree Shop/Stock --path <root>`?"],
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
    outcome: "ok",
    out: ["Twin | (none) | twin a", "Twin | (none) | twin b"],
    err: [],
  });
  expect(await tree(root, "Twin")).toEqual({
    outcome: "invalid",
    out: [],
    err: ["'Twin' names 2 siblings; `nuhokai check --path <root>` reports the clash"],
  });
});
