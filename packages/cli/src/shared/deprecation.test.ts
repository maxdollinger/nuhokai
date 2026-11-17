import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCliFiles } from "../init/cli-files.ts";
import { type LoadedNode, type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { deprecationOf, deprecationsOfUse } from "./deprecation.ts";

const root = mkdtempSync(join(tmpdir(), "nuhokai-deprecation-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A world loaded from one index.ts holding `nodes` and listing `children` at the top level. */
async function world(nodes: string, children: string): Promise<LoadedWorld> {
  const dir = mkdtempSync(join(root, "w-"));
  mkdirSync(join(dir, "nuhokai"));
  writeFileSync(
    join(dir, "nuhokai/index.ts"),
    `import { defineWorld, inherited, node } from "@nuhokai/world";
${nodes}
export default defineWorld({ id: "w", name: "w", source: [], children: [${children}] });
`,
  );
  writeCliFiles(dir);
  return loadWorld(dir);
}

/** The node at a hierarchy path; the test fails if there is none. */
function at(loaded: LoadedWorld, path: string): LoadedNode {
  const node = loaded.nodes.find((candidate) => candidate.path === path);
  if (!node) throw new Error(`no ${path}`);
  return node;
}

const port = '{ kind: "call", purpose: "p" }';

test("R1: a node is under its own note, else the nearest dome's around it; a blank note says nothing", async () => {
  const loaded = await world(
    `export const Lines = node({ id: "lines", purpose: "p", deprecated: "  ", source: [] }).edges({});
export const Orders = node({ id: "orders", purpose: "p", source: [], children: [Lines] }).edges({});
export const Shop = node({ id: "shop", purpose: "p", deprecated: " use Store ", source: [], children: [Orders] }).edges({});
export const Stock = node({ id: "stock", purpose: "p", source: [] }).edges({});`,
    "Shop, Stock",
  );
  expect(deprecationOf(loaded, at(loaded, "Shop/Orders/Lines"))).toEqual({
    note: "use Store",
    by: at(loaded, "Shop"),
  });
  expect(deprecationOf(loaded, at(loaded, "Stock"))).toBeUndefined();
});

test("R2: a use meets the target's deprecation, a dome port's deprecated delegate, an inherited port's deprecated contract", async () => {
  const loaded = await world(
    `export const Store = node({ id: "store", purpose: "p", source: [], abstract: true, deprecated: "use Warehouse", ports: { keep: ${port} } }).edges({});
export const Shelf = node({ id: "shelf", purpose: "p", source: [], implements: () => [Store], ports: { show: ${port} } }).edges({});
export const Inner = node({ id: "inner", purpose: "p", source: [], deprecated: "use Outer", ports: { run: ${port}, stop: ${port} } }).edges({});
export const Kept = node({ id: "kept", purpose: "p", source: [], ports: { go: ${port} } }).edges({});
export const Middle = node({ id: "middle", purpose: "p", source: [], children: [Inner], ports: { run: Inner.run } }).edges({});
export const Box = node({ id: "box", purpose: "p", source: [], children: [Middle, Kept, Shelf], ports: { run: Middle.run, go: Kept.go, keep: inherited(Shelf, Store.keep) } }).edges({});`,
    "Store, Box",
  );
  const box = at(loaded, "Box");
  const uses = (ports: string[]) =>
    deprecationsOfUse(loaded, box, ports).map(({ by, note, ports: led }) => [by.path, note, led]);
  // Two levels of delegates, then a contract behind an inherited dome port; a plain port meets nothing.
  expect(uses(["go", "run", "keep"])).toEqual([
    ["Box/Middle/Inner", "use Outer", ["run"]],
    ["Store", "use Warehouse", ["keep"]],
  ]);
  expect(uses(["go", "missing"])).toEqual([]);
  // Uses of the deprecated node itself: one entry naming every port.
  expect(deprecationsOfUse(loaded, at(loaded, "Box/Middle/Inner"), ["run", "stop"])).toMatchObject([
    { note: "use Outer", ports: ["run", "stop"] },
  ]);
});
