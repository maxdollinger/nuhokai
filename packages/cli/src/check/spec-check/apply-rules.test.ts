import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadWorld } from "../../load/load-world.ts";
import { format } from "../../shared/diagnostics.ts";
import { applyRules } from "./apply-rules.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A fresh project directory per test (Bun caches world modules by path) with these files, by relative path. */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "nuhokai-spec-check-test-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/** The world file listing `children`, imported from the files named. */
function index(children: string, imports: string, source = "[]"): string {
  return `import { defineWorld } from "@nuhokai/world";
${imports}
export default defineWorld({ id: "world-id", name: "Test", source: ${source}, children: [${children}] });
`;
}

const HEADER = `import { inherited, node, tbd } from "@nuhokai/world";\n`;

/** A leaf's node() call on one line; `rest` adds fields. */
function leaf(name: string, id: string, rest = "", edges = "{}"): string {
  return `export const ${name} = node({ id: "${id}", purpose: "p", status: "planned", source: [], ports: { run: { kind: "call", purpose: "r" } }${rest ? `, ${rest}` : ""} }).edges(${edges});\n`;
}

/** Spec findings of the project as diagnostics lines, the files named relative to the project. */
async function check(root: string): Promise<string[]> {
  const world = await loadWorld(root);
  return applyRules(root, world).map((finding) => format([finding]).join("").replaceAll(`${root}/`, ""));
}

test("a clean world has no findings", async () => {
  const root = project({
    "nuhokai/index.ts": index("A, B", `import { A, B } from "./a.ts";`),
    "nuhokai/a.ts": HEADER + leaf("A", "a") + leaf("B", "b", "", "{ uses: () => [A.run] }"),
  });
  expect(await check(root)).toEqual([]);
});

test("R1: a node listed in the world and in a dome is one error naming nuhokai/index.ts and the dome's file", async () => {
  const root = project({
    "nuhokai/index.ts": index(
      "Dome, Shared",
      `import { Dome } from "./dome.ts";\nimport { Shared } from "./shared.ts";`,
    ),
    "nuhokai/shared.ts": HEADER + leaf("Shared", "shared"),
    "nuhokai/dome.ts": `${HEADER}import { Shared } from "./shared.ts";
export const Dome = node({ id: "dome", purpose: "p", status: "planned", source: [], children: [Shared], ports: { run: Shared.run } }).edges({});
`,
  });
  expect(await check(root)).toEqual([
    "error: nuhokai/index.ts:4: Dome/Shared: listed twice: in Dome's children (nuhokai/dome.ts:3) and in the world's children (nuhokai/index.ts:4); keep one of the two listings",
  ]);
});

test("R1: a child copy-pasted with its parent's id is one error, and nothing else is judged of that id", async () => {
  const root = project({
    "nuhokai/index.ts": index("Dome", `import { Dome } from "./dome.ts";`, `["src/**"]`),
    "src/x.ts": "",
    "nuhokai/dome.ts": `${HEADER}
export const Child = node({ id: "dome", purpose: "p", status: "built", source: ["src/x.ts", "src/gone.ts"], ports: { run: { kind: "call", purpose: "r" } } }).edges({ uses: () => [Other.run] });
export const Other = node({ id: "other", purpose: "p", status: "planned", source: ["src/x.ts"], ports: { run: { kind: "call", purpose: "r" } } }).edges({});
export const Inner = node({ id: "inner", purpose: "p", status: "planned", source: [], children: [Other], ports: {} }).edges({});
export const Dome = node({ id: "dome", purpose: "p", status: "planned", source: [], children: [Child, Inner], ports: { run: Child.run } }).edges({});
`,
  });
  expect(await check(root)).toEqual([
    `error: nuhokai/dome.ts:3: Dome/Child: id "dome" is already the id of Dome (nuhokai/dome.ts); give one of them a fresh, unique id`,
  ]);
});

test("R1: a child sharing its dome's id leaves its siblings under the dome", async () => {
  const root = project({
    "nuhokai/index.ts": index("P, T", `import { P, T } from "./p.ts";`),
    "nuhokai/p.ts": `${HEADER}${leaf("C1", "x")}${leaf("C2", "c2", 'status: "built"')}${leaf("T", "t", "", "{ uses: () => [C2.run] }")}export const P = node({ id: "x", purpose: "p", status: "planned", source: [], children: [C1, C2], ports: { run: C2.run } }).edges({});
`,
  });
  expect(await check(root)).toEqual([
    'error: nuhokai/p.ts:2: P/C1: id "x" is already the id of P (nuhokai/p.ts); give one of them a fresh, unique id',
    'error: nuhokai/p.ts:3: P/C2: a built node lists no source; list its code in source, e.g. ["src/orders/**"], or set its status to "planned"',
    "error: nuhokai/p.ts:4: T: T uses C2.run, but P/C2 is inside P; a node uses only its siblings and its ancestors' siblings; expose the port through P's ports and use that, or move T into P",
  ]);
});

test("R1, DataRules R4: a world index.ts re-exports from another file is judged where defineWorld is written", async () => {
  const root = project({
    "nuhokai/index.ts": '// the entry point\nimport { TheWorld } from "./w.ts";\n\nexport default TheWorld;\n',
    "nuhokai/w.ts": `import { defineWorld } from "@nuhokai/world";
import { A } from "./a.ts";
export const TheWorld = defineWorld({ id: "world-id", name: "", source: [], children: [A, A] });
`,
    "nuhokai/a.ts": HEADER + leaf("A", "a"),
  });
  expect(await check(root)).toEqual([
    "error: nuhokai/w.ts:3: A: listed twice: in the world's children (nuhokai/w.ts:3) and in the world's children (nuhokai/w.ts:3); keep one of the two listings",
    'error: nuhokai/w.ts:3: the world\'s name is blank; give defineWorld a name, e.g. name: "Shop"',
  ]);
});

test("R1: the world's own id is taken too", async () => {
  const root = project({
    "nuhokai/index.ts": index("A", `import { A } from "./a.ts";`),
    "nuhokai/a.ts": HEADER + leaf("A", "world-id"),
  });
  expect(await check(root)).toEqual([
    `error: nuhokai/a.ts:2: A: id "world-id" is already the id of the world (nuhokai/index.ts); give one of them a fresh, unique id`,
  ]);
});

test("R2: an exported node missing from index.ts is one warning naming its file; its own broken edges go unreported", async () => {
  const root = project({
    "nuhokai/index.ts": index("A", `import { A } from "./a.ts";`),
    "nuhokai/a.ts": HEADER + leaf("A", "a"),
    "nuhokai/lost.ts": `${HEADER}import { A } from "./a.ts";
export const Box = node({ id: "box", purpose: "p", status: "planned", source: [], children: [A], ports: { run: A.run } }).edges({});
export const Lost = node({ id: "lost", purpose: "p", status: "built", source: ["src/gone/**"] }).edges({ uses: () => [A.run] });
`,
  });
  expect(await check(root)).toEqual([
    "warning: nuhokai/lost.ts:3: Box: exported but not reachable from the world; list it in a dome's children or in the world's (nuhokai/index.ts), or delete it",
    "warning: nuhokai/lost.ts:4: Lost: exported but not reachable from the world; list it in a dome's children or in the world's (nuhokai/index.ts), or delete it",
  ]);
});

const NESTED = (target: string) => ({
  "nuhokai/index.ts": index("Stock, Orders", `import { Orders, Stock } from "./shop.ts";`),
  "nuhokai/shop.ts": `${HEADER}
export const Reserve = node({ id: "reserve", purpose: "p", status: "planned", source: [], ports: { reserve: { kind: "call", purpose: "r" } } }).edges({});
export const Stock = node({ id: "stock", purpose: "p", status: "planned", source: [], children: [Reserve], ports: { reserve: Reserve.reserve } }).edges({});
export const Orders = node({ id: "orders", purpose: "p", status: "planned", source: [] }).edges({ uses: () => [${target}] });
`,
});

test("R3, R8: a leaf using a port of a sibling's child is an error naming the edge, its fix lists both ways out", async () => {
  expect(await check(project(NESTED("Reserve.reserve")))).toEqual([
    "error: nuhokai/shop.ts:5: Orders: Orders uses Reserve.reserve, but Stock/Reserve is inside Stock; a node uses only its siblings and its ancestors' siblings; expose the port through Stock's ports and use that, or move Orders into Stock",
  ]);
});

test("R3: the same port exposed by the sibling passes", async () => {
  expect(await check(project(NESTED("Stock.reserve")))).toEqual([]);
});

test("R3: an ancestor's sibling is in scope, the ancestor itself is not, nor a node outside the world", async () => {
  const root = project({
    "nuhokai/index.ts": index("Top, Dome", `import { Dome, Top } from "./a.ts";`),
    "nuhokai/a.ts": `${HEADER}
export const Top = node({ id: "top", purpose: "p", status: "planned", source: [], ports: { run: { kind: "call", purpose: "r" } } }).edges({});
export const Stray = node({ id: "stray", purpose: "p", status: "planned", source: [], ports: { run: { kind: "call", purpose: "r" } } }).edges({});
export const Deep = node({ id: "deep", purpose: "p", status: "planned", source: [], ports: { run: { kind: "call", purpose: "r" } } }).edges({ uses: () => [Top.run, Dome.run, Stray.run] });
export const Dome = node({ id: "dome", purpose: "p", status: "planned", source: [], children: [Deep], ports: { run: Deep.run } }).edges({});
`,
  });
  expect(await check(root)).toEqual([
    "warning: nuhokai/a.ts:4: Stray: exported but not reachable from the world; list it in a dome's children or in the world's (nuhokai/index.ts), or delete it",
    "error: nuhokai/a.ts:5: Dome/Deep: Deep uses Dome.run, a port of its own ancestor; a node uses only its siblings and its ancestors' siblings; use the port of a sibling instead, or drop the edge",
    "error: nuhokai/a.ts:5: Dome/Deep: Deep uses Stray.run, but Stray is not reachable from the world; list Stray in the world or in a dome in scope, or drop the edge",
  ]);
});

const STORES = (second: string) => ({
  "nuhokai/index.ts": index(
    "Orders, Stock",
    `import { Orders } from "./orders.ts";\nimport { Stock } from "./stock.ts";`,
  ),
  "nuhokai/orders/store.ts": HEADER + leaf("Store", "orders-store"),
  "nuhokai/stock/store.ts": HEADER + leaf("Store", "stock-store"),
  "nuhokai/orders.ts": `${HEADER}import { Store } from "./orders/store.ts";
import { Store as StockStore } from "./stock/store.ts";
export const Orders = node({ id: "orders", purpose: "p", status: "planned", source: [], children: [Store${second}], ports: {} }).edges({});
`,
  "nuhokai/stock.ts": `${HEADER}import { Store } from "./stock/store.ts";
export const Stock = node({ id: "stock", purpose: "p", status: "planned", source: [], children: [Store], ports: {} }).edges({});
`,
});

test("R4: two children of one dome named Store is an error naming both files", async () => {
  const root = project(STORES(", StockStore"));
  rmSync(join(root, "nuhokai/stock.ts"));
  writeFileSync(join(root, "nuhokai/index.ts"), index("Orders", `import { Orders } from "./orders.ts";`));
  expect(await check(root)).toEqual([
    "error: nuhokai/stock/store.ts:2: Orders/Store: Orders/Store is the name of two siblings, in nuhokai/orders/store.ts and nuhokai/stock/store.ts; rename one of the two exports, or move one node into another dome",
  ]);
});

test("R4: Store under two domes passes as Orders/Store and Stock/Store", async () => {
  expect(await check(project(STORES("")))).toEqual([]);
});

test("R5: malformed requirements and test cases are errors naming the node and field, never a crash", async () => {
  const root = project({
    "nuhokai/index.ts": index("A, B", `import { A, B } from "./a.ts";`),
    "nuhokai/a.ts": `${HEADER}${leaf("A", "a", "requirements: 5 as any, testCases: 7 as any")}${leaf("B", "b", 'requirements: [null, { id: "R1", text: "t" }] as any, testCases: [null, { text: "t", demonstrates: 5 }] as any')}`,
  });
  expect(await check(root)).toEqual([
    "error: nuhokai/a.ts:2: A: requirements is not a list; make requirements a list of objects, or drop it",
    "error: nuhokai/a.ts:2: A: testCases is not a list; make testCases a list of objects, or drop it",
    "error: nuhokai/a.ts:3: B: requirements[0] is not an object; make it an object, or drop it from requirements",
    "error: nuhokai/a.ts:3: B: test case 1's demonstrates is not a list; make it a list of requirement ids, or drop it",
    "error: nuhokai/a.ts:3: B: testCases[0] is not an object; make it an object, or drop it from testCases",
  ]);
});

test("R5: two requirements whose ids come from one variable are an error naming the node", async () => {
  const root = project({
    "nuhokai/index.ts": index("A", `import { A } from "./a.ts";`),
    "nuhokai/a.ts": `${HEADER}const id: string = "R1";
${leaf("A", "a", 'requirements: [{ id, text: "one" }, { id, text: "two" }], testCases: [{ text: "t", demonstrates: ["R2"] }]')}`,
  });
  expect(await check(root)).toEqual([
    'error: nuhokai/a.ts:3: A: requirement id "R1" is used twice; give each requirement its own id',
    'error: nuhokai/a.ts:3: A: test case 0 demonstrates "R2", which is not one of its requirement ids; name one of "R1", "R1", or drop "R2"',
  ]);
});

test("R5: flags that are not literals still hold: no external child, no externalType on an internal node, no abstract uses", async () => {
  const root = project({
    "nuhokai/index.ts": index("Dome, Contract", `import { Contract, Dome } from "./a.ts";`),
    "nuhokai/a.ts": `${HEADER}const yes: boolean = true;
export const later = tbd.call({ description: "later" });
export const Contract = node({ id: "contract", purpose: "p", status: "planned", source: [], abstract: yes, ports: { run: { kind: "call", purpose: "r" } } }).edges({ uses: () => [later] });
export const Ext = node({ id: "ext", purpose: "p", status: "planned", source: [], external: yes }).edges({});
export const Int = node({ id: "int", purpose: "p", status: "planned", source: [], externalType: "db" }).edges({});
export const Dome = node({ id: "dome", purpose: "p", status: "planned", source: [], children: [Ext, Int], ports: {} }).edges({});
`,
  });
  expect(await check(root)).toEqual([
    "error: nuhokai/a.ts:4: Contract: an abstract node has uses edges; drop its uses, or make it not abstract",
    "error: nuhokai/a.ts:5: Dome/Ext: an external node is not at the top level; list it in the world's children, or make it not external",
    "error: nuhokai/a.ts:6: Dome/Int: externalType is set on a node that is not external; drop externalType, or make the node external",
  ]);
});

const SOURCES = (claims: Record<string, string>, extra: Record<string, string> = {}) => ({
  "nuhokai/index.ts": index("A, B, Dome", `import { A, B, Dome } from "./a.ts";`, `["src/**"]`),
  "nuhokai/a.ts": `${HEADER}
export const A = node({ id: "a", purpose: "p", status: "planned", source: ${claims.A ?? "[]"} }).edges({});
export const B = node({ id: "b", purpose: "p", status: "planned", source: ${claims.B ?? "[]"} }).edges({});
export const C = node({ id: "c", purpose: "p", status: "planned", source: ${claims.C ?? "[]"} }).edges({});
export const Dome = node({ id: "dome", purpose: "p", status: "planned", source: ${claims.Dome ?? "[]"}, children: [C], ports: {} }).edges({});
`,
  "src/shared.ts": "",
  "src/map/draw-map.ts": "",
  "src/map/map-file.ts": "",
  "scripts/x.ts": "",
  ...extra,
});

test("R6: source ['src/gone/**'] is an error naming the node and the entry", async () => {
  expect(await check(project(SOURCES({ A: `["src/gone/**", "src/shared.ts"]` })))).toEqual([
    'error: nuhokai/a.ts:3: A: source entry "src/gone/**" matches no file; fix the path or glob, or drop the entry',
  ]);
});

test("R6: under --path app the source resolves in app/, not the cwd", async () => {
  const parent = project({ "src/only-in-cwd.ts": "" });
  const app = join(parent, "app");
  const files = SOURCES({ A: `["src/shared.ts"]`, B: `["src/only-in-cwd.ts"]` });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(app, path)), { recursive: true });
    writeFileSync(join(app, path), content);
  }
  const cwd = process.cwd();
  process.chdir(parent);
  try {
    expect((await applyRules("app", await loadWorld("app"))).map((finding) => format([finding]).join(""))).toEqual([
      'error: app/nuhokai/a.ts:4: B: source entry "src/only-in-cwd.ts" matches no file; fix the path or glob, or drop the entry',
    ]);
  } finally {
    process.chdir(cwd);
  }
});

test("R7: two siblings claiming src/shared.ts is an error naming both and the file", async () => {
  expect(await check(project(SOURCES({ A: `["src/shared.ts"]`, B: `["src/*.ts"]` })))).toEqual([
    "error: nuhokai/a.ts:4: B: src/shared.ts is in the source of both A (nuhokai/a.ts) and B; keep the file in one node's source, or move the shared code into a node of its own",
  ]);
});

test("R7: a dome's src/map/** over its child's src/map/draw-map.ts passes", async () => {
  expect(await check(project(SOURCES({ Dome: `["src/map/**"]`, C: `["src/map/draw-map.ts"]` })))).toEqual([]);
});

test("R10: world source ['src/**'] and a node claiming scripts/x.ts is an error naming the node and the entry", async () => {
  expect(await check(project(SOURCES({ A: `["scripts/x.ts"]` })))).toEqual([
    "error: nuhokai/a.ts:3: A: source entry \"scripts/x.ts\" matches scripts/x.ts, which is not under the world's source; narrow the entry to the world's source, or add the file to the world's source in nuhokai/index.ts",
  ]);
});

test("R6: an entry spread in from another file points at the spread; one written in the node's file at itself", async () => {
  const root = project(
    SOURCES({ A: `[...GONE, "src/also-gone.ts"]` }, { "nuhokai/gone.ts": 'export const GONE = ["src/gone.ts"];\n' }),
  );
  writeFileSync(
    join(root, "nuhokai/a.ts"),
    `import { GONE } from "./gone.ts";\n${readFileSync(join(root, "nuhokai/a.ts"), "utf8")}`,
  );
  expect(await check(root)).toEqual([
    'error: nuhokai/a.ts:4: A: source entry "src/also-gone.ts" matches no file; fix the path or glob, or drop the entry',
    'error: nuhokai/a.ts:4: A: source entry "src/gone.ts" matches no file; fix the path or glob, or drop the entry',
  ]);
});

test("R10: absolute entries and ones leading out with .. are refused; others are normalized", async () => {
  const root = project(SOURCES({ A: `["src/../src/shared.ts", "/etc/passwd"]`, B: `["../x/**", "src//map/*.ts"]` }));
  expect(await check(root)).toEqual([
    "error: nuhokai/a.ts:3: A: source entry \"/etc/passwd\" lies outside the project directory, so outside the world's source; list only paths inside the world's source",
    "error: nuhokai/a.ts:4: B: source entry \"../x/**\" lies outside the project directory, so outside the world's source; list only paths inside the world's source",
  ]);
});

test("R10: world source ['../shared/**'] is an error naming the world", async () => {
  const root = project(SOURCES({}));
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    index("A, B, Dome", `import { A, B, Dome } from "./a.ts";`, `["../shared/**"]`),
  );
  expect(await check(root)).toEqual([
    'error: nuhokai/index.ts:3: the world\'s source entry "../shared/**" lies outside the project directory; list only paths inside the project directory, or run check with --path at the directory holding the code',
  ]);
});

test("SourceRules R3: a source that is no list, or an entry that is no string, is an error, never a crash", async () => {
  const root = project(SOURCES({ A: `[42 as unknown as string]` }));
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    index("A, B, Dome", `import { A, B, Dome } from "./a.ts";`, `"src/**" as unknown as string[]`),
  );
  expect(await check(root)).toEqual([
    "error: nuhokai/a.ts:3: A: A's source lists 42, which is not a string; list paths or globs",
    'error: nuhokai/index.ts:3: the world\'s source is not a list; make it a list of paths or globs, e.g. ["src/**"]',
  ]);
});

test("SourceRules R1: a symlink out of the project directory is never followed", async () => {
  const outside = project({ "secret.ts": "" });
  const root = project(SOURCES({ A: `["src/link/**"]` }));
  const { symlinkSync } = await import("node:fs");
  symlinkSync(outside, join(root, "src/link"));
  expect(await check(root)).toEqual([
    'error: nuhokai/a.ts:3: A: source entry "src/link/**" matches no file; fix the path or glob, or drop the entry',
  ]);
});

test("R6: a file whose name holds a space is a file like any other", async () => {
  const root = project(
    SOURCES(
      { A: `["src/assets/**"]`, B: `["src/map/My Map.ts"]` },
      { "src/assets/Screen Shot.png": "", "src/map/My Map.ts": "" },
    ),
  );
  expect(await check(root)).toEqual([]);
});

test("R9: a built leaf with source [] is an error naming the node; the same planned, or an external, passes", async () => {
  const root = project({
    "nuhokai/index.ts": index("Built, Planned, Ext", `import { Built, Ext, Planned } from "./a.ts";`),
    "nuhokai/a.ts": `${HEADER}
export const Built = node({ id: "built", purpose: "p", status: "built", source: [] }).edges({});
export const Planned = node({ id: "planned", purpose: "p", status: "planned", source: [] }).edges({});
export const Ext = node({ id: "ext", purpose: "p", status: "built", source: [], external: true }).edges({});
`,
  });
  expect(await check(root)).toEqual([
    'error: nuhokai/a.ts:3: Built: a built node lists no source; list its code in source, e.g. ["src/orders/**"], or set its status to "planned"',
  ]);
});

test("R11: implementing a contract listed nowhere, or a node that is not abstract, is an error naming the edge", async () => {
  const root = project({
    "nuhokai/index.ts": index("Orders, Plain", `import { Orders, Plain } from "./a.ts";`),
    "nuhokai/a.ts": `${HEADER}
export const Audit = node({ id: "audit", purpose: "p", status: "planned", source: [], abstract: true, ports: { history: { kind: "call", purpose: "h" } } }).edges({});
export const Plain = node({ id: "plain", purpose: "p", status: "planned", source: [] }).edges({});
export const Orders = node({ id: "orders", purpose: "p", status: "planned", source: [], implements: () => [Audit, Plain as unknown as typeof Audit] }).edges({});
`,
  });
  expect(await check(root)).toEqual([
    "warning: nuhokai/a.ts:3: Audit: exported but not reachable from the world; list it in a dome's children or in the world's (nuhokai/index.ts), or delete it",
    "error: nuhokai/a.ts:5: Orders: Orders implements Audit, which is not reachable from the world; list Audit in the world or a dome, or drop it from implements",
    "error: nuhokai/a.ts:5: Orders: Orders implements Plain, which is not abstract; make Plain abstract, implement an abstract node instead, or drop it from implements",
  ]);
});

test("R5: two contracts sharing a port name, and an own port named like an inherited one, are errors", async () => {
  const root = project({
    "nuhokai/index.ts": index("A, B, Orders", `import { A, B, Orders } from "./a.ts";`),
    "nuhokai/a.ts": `${HEADER}
export const A = node({ id: "ca", purpose: "p", status: "planned", source: [], abstract: true, ports: { run: { kind: "call", purpose: "r" } } }).edges({});
export const B = node({ id: "cb", purpose: "p", status: "planned", source: [], abstract: true, ports: { run: { kind: "call", purpose: "r" } } }).edges({});
export const Orders = node({ id: "orders", purpose: "p", status: "planned", source: [], ports: { run: { kind: "call", purpose: "r" } }, implements: () => [A, B] as never }).edges({});
`,
  });
  expect(await check(root)).toEqual([
    "error: nuhokai/a.ts:5: Orders: A and B both declare a port named run; rename the port in one contract, or implement only one of them",
    "error: nuhokai/a.ts:5: Orders: own port run has the name of a port inherited from A; rename the own port run",
  ]);
});

test("ApplyRules R1: findings sort by file, line, rule, node; the same world gives byte-identical output", async () => {
  const root = project(SOURCES({ A: `["src/gone.ts"]`, B: `["src/gone.ts"]` }));
  const first = await check(root);
  expect(first).toEqual([
    'error: nuhokai/a.ts:3: A: source entry "src/gone.ts" matches no file; fix the path or glob, or drop the entry',
    'error: nuhokai/a.ts:4: B: source entry "src/gone.ts" matches no file; fix the path or glob, or drop the entry',
  ]);
  expect(
    applyRules(root, await loadWorld(root))
      .map((finding) => format([finding]).join(""))
      .join("\n"),
  ).toBe(first.map((line) => line.replaceAll("nuhokai/", `${root}/nuhokai/`)).join("\n"));
});
