import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../init/scaffold.ts";
import { splitReport } from "../shared/split-report.ts";
import { type Scope, scopeAt } from "./review-scope.ts";
import { named, ROOT } from "./test-world.ts";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The scope of the node at `path`; the test fails if it is not reviewable. */
async function scoped(root: string, path: string): Promise<Scope> {
  const scope = await scopeAt(root, path);
  if ("outcome" in scope) throw new Error(`${path} is not reviewable: ${splitReport(scope).err.join("; ")}`);
  return scope;
}

/** Why the node at `path` is not reviewable: the one line of the invalid Report. */
async function refusal(root: string, path: string): Promise<string | undefined> {
  const scope = await scopeAt(root, path);
  if (!("outcome" in scope)) throw new Error(`${path} is reviewable`);
  const report = splitReport(scope);
  expect(report).toMatchObject({ outcome: "invalid", out: [] });
  expect(report.err).toHaveLength(1);
  return report.err[0];
}

/** An init'd project whose example node lists `source`, with src/example.ts written. */
async function example(source: string): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "nuhokai-review-scope-"));
  temps.push(root);
  expect((await runInit(root)).outcome).toBe("ok");
  const file = join(root, "nuhokai/example.ts");
  writeFileSync(file, readFileSync(file, "utf8").replace("source: [],", `source: ${source},`));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/example.ts"), "export {};\n");
  return root;
}

test("R2, R3, R7: PrintTree's files and what it may use; LoadWorld's files are every file under src/load/, sorted", async () => {
  const printTree = await scoped(ROOT, "Tree/PrintTree");
  expect(printTree.node).toBe("Tree/PrintTree");
  expect(printTree.specFile).toBe(named("nuhokai/tree/print-tree.ts"));
  expect(printTree.files).toEqual([named("src/tree/print-tree.test.ts"), named("src/tree/print-tree.ts")]);
  expect(printTree.example).toBe("requirements[R1]");
  expect(printTree.uses[0]).toMatchObject({ name: "LoadWorld", ports: ["load"], node: { path: "LoadWorld" } });
  expect(printTree.drafts).toEqual([]);
  expect(printTree.items.length).toBeGreaterThan(0);

  const load = await scoped(ROOT, "LoadWorld");
  const expected = readdirSync(join(ROOT, "src/load"))
    .sort()
    .map((file) => named(`src/load/${file}`));
  expect(load.files).toEqual(expected);
});

test("R1: a dome names tree, a node without source or with one that is no list says why, a source matching nothing names check", async () => {
  expect(await refusal(ROOT, "Check")).toBe(
    `Check is a dome, and a review covers one leaf; \`nuhokai tree Check${ROOT === "." ? "" : ` --path ${ROOT}`}\` lists its children`,
  );
  expect(await refusal(ROOT, "Terminal")).toBe(
    "Terminal has no source to review: it is external; review a node whose source lists its code",
  );
  const root = await example('["src/gone.ts"]');
  expect(await refusal(root, "Example")).toBe(
    `Example's source matches no file; \`nuhokai check --path ${root}\` names the entry to fix`,
  );
  const notList = await example('"src/example.ts"');
  expect(await refusal(notList, "Example")).toBe(
    "Example has no source to review: it is not built yet; review a node whose source lists its code",
  );
});

test("R2: files as check finds them, each entry normalized, a file named twice listed once", async () => {
  const root = await example('["src//example.ts", "src/example.ts", "./src/example.ts"]');
  expect((await scoped(root, "Example")).files).toEqual([`${root}/src/example.ts`]);
});

test("R4, R5, R7: the example node's tbd is one draft with its description, never among the uses; same input, same scope", async () => {
  const root = await example('["src/**"]');
  const scope = await scoped(root, "Example");
  expect(scope.drafts).toMatchObject([{ description: "Describe what this node has to do", name: "later" }]);
  expect(scope.drafts).toHaveLength(1);
  expect(scope.uses).toEqual([]);
  expect(scope.files).toEqual([`${root}/src/example.ts`]);
  expect(scope.example).toBe("purpose");
  expect(await scoped(root, "Example")).toEqual(scope);
});

test("R3: a uses edge to an orphan is listed by its name, without a node", async () => {
  const root = await example('["src/**"]');
  const file = join(root, "nuhokai/example.ts");
  writeFileSync(
    file,
    `${readFileSync(file, "utf8").replace("uses: () => [later]", "uses: () => [later, Lost.run]")}
export const Lost = node({ id: "lost", purpose: "Listed nowhere.", status: "planned", source: [], ports: { run: { kind: "call", purpose: "Run" } } }).edges({});
`,
  );
  expect((await scoped(root, "Example")).uses).toEqual([{ name: "Lost", ports: ["run"] }]);
});

test("R6: a path naming no node → its invalid Report; no world → thrown", async () => {
  expect(await refusal(ROOT, "Tree/PrintTre")).toContain("did you mean `nuhokai tree Tree/PrintTree");
  const empty = mkdtempSync(join(tmpdir(), "nuhokai-review-scope-"));
  temps.push(empty);
  await expect(scopeAt(empty, "Tree/PrintTree")).rejects.toThrow("no nuhokai/");
});
