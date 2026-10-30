import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { detailsOf, mapScene, type ScopeView, scopeView } from "./scene.js";

const EXAMPLE = join(import.meta.dir, "../../../world/example");
const root = mkdtempSync(join(tmpdir(), "nuhokai-scene-test-"));

/** packages/world/example as a repo's world: imports @nuhokai/world; the compile-time-only file stays out. */
function exampleWorld(): string {
  mkdirSync(join(root, "nuhokai"));
  for (const file of readdirSync(EXAMPLE)) {
    if (file.endsWith(".test.ts") || file === "type-errors.ts") continue;
    const source = readFileSync(join(EXAMPLE, file), "utf8").replaceAll('"../src/index.ts"', '"@nuhokai/world"');
    writeFileSync(join(root, "nuhokai", file), source);
  }
  return root;
}

const world = await loadWorld(exampleWorld());
const scene = mapScene(world);
const indexOf = (name: string) => world.nodes.findIndex((node) => node.name === name);

afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A view's items and connections by name, so expectations read like the map. */
function named(view: ScopeView) {
  const name = (key: string) => view.items.find((item) => item.key === key)?.name;
  return {
    items: Object.fromEntries(view.items.map((item) => [item.name, item])),
    lanes: view.lanes.map((lane) => [lane.kind, name(lane.from), name(lane.to), lane.ports]),
    air: view.air.map((route) => [name(route.from), name(route.to), route.ports]),
  };
}

const HOLE = "Tell a customer that their order changed; channel (mail, push) not decided yet.";

test("top level: Stock's Postgres lane and the notifyCustomer hole start at Shop", () => {
  const top = named(scopeView(scene, null));

  expect(top.lanes).toEqual([
    ["implements", "Shop", "AuditLog", []],
    ["uses", "Shop", "Postgres", ["query"]],
    ["hole", "Shop", HOLE, []],
  ]);
  expect(top.air).toEqual([]);
  expect(top.items.Postgres).toMatchObject({ kind: "external", look: "db", side: 1 });
  expect(top.items.AuditLog).toMatchObject({ kind: "island", abstract: true, status: "planned" });
  expect(top.items.Shop).toMatchObject({ kind: "island", dome: true, parts: 2 });
  expect(top.items[HOLE]).toMatchObject({ kind: "hole", side: 1, portKind: "call" });
});

test("the top level is named after the world, as its view and first breadcrumb", () => {
  const top = scopeView(scene, null);

  expect(world.name).toBe("Shop");
  expect(top.name).toBe("Shop");
  expect(top.path).toEqual([{ scope: null, name: "Shop" }]);
});

test("a world without a name, or with a blank one, still calls its top level World", () => {
  const unnamed: LoadedWorld = {
    id: "w",
    nodes: [],
    placeholders: [],
    file: "nuhokai/index.ts",
    parents: [],
    listings: [],
    orphans: [],
    files: [],
  };

  for (const loaded of [unnamed, { ...unnamed, name: "  " }]) {
    const top = scopeView(mapScene(loaded), null);
    expect(top.name).toBe("World");
    expect(top.path).toEqual([{ scope: null, name: "World" }]);
  }
});

test("inside Shop: the same lane and hole start at Stock, entries lead to their delegate", () => {
  const view = scopeView(scene, indexOf("Shop"));
  const shop = named(view);

  expect(view.path.map((crumb) => crumb.name)).toEqual(["Shop", "Shop"]);
  expect(view.items.filter((item) => item.kind === "island").map((item) => item.name)).toEqual(["Orders", "Stock"]);
  expect(shop.lanes).toEqual([
    ["uses", "Orders", "Stock", ["reserve"]],
    ["implements", "Orders", "AuditLog", []],
    ["uses", "Stock", "Postgres", ["query"]],
    ["hole", "Orders", HOLE, []],
    ["hole", "Stock", HOLE, []],
    ["entry", "Shop ports", "Orders", ["placeOrder", "orderHistory"]],
  ]);
  // Stock listens to Orders.cancelled: an air route from the publisher.
  expect(shop.air).toEqual([["Orders", "Stock", ["cancelled"]]]);
  expect(shop.items.AuditLog).toMatchObject({ kind: "outside", side: 1 });
  expect(shop.items.Postgres).toMatchObject({ kind: "external", look: "db" });
  expect(shop.items.Orders).toMatchObject({ level: 1 });
  expect(shop.items.Stock).toMatchObject({ level: 0 });
});

test("an edge listing a call and an event port is a lane and an air route; groups are pillars", () => {
  const leaf = (id: string, name: string, extra: object = {}) => ({
    schema: "nuhokai/node@1" as const,
    id,
    name,
    parent: null,
    external: false,
    abstract: false,
    purpose: name,
    status: "built" as const,
    source: [],
    ...extra,
  });
  const loaded: LoadedWorld = {
    id: "w",
    nodes: [
      leaf("a", "A", {
        group: "core",
        ports: [
          { name: "run", kind: "call", purpose: "run" },
          { name: "ran", kind: "event", purpose: "ran" },
        ],
      }),
      leaf("b", "B", { group: "core", edges: [{ kind: "uses", to: "a", port: ["run", "ran"] }] }),
      leaf("c", "C", { external: true, externalType: "caller", edges: [{ kind: "uses", to: "b", port: ["x"] }] }),
    ],
    placeholders: [],
    file: "nuhokai/index.ts",
    parents: [null, null, null],
    listings: [],
    orphans: [],
    files: [],
  };

  const view = scopeView(mapScene(loaded), null);
  const top = named(view);

  expect(top.lanes).toEqual([
    ["uses", "B", "A", ["run"]],
    ["uses", "C", "B", ["x"]],
  ]);
  expect(top.air).toEqual([["A", "B", ["ran"]]]);
  expect(top.items.C).toMatchObject({ kind: "external", look: "village", side: -1 });
  expect(view.pillars).toEqual([{ id: "core", name: "core", members: ["node:0", "node:1"] }]);
});

test("a call cycle between islands still gets finite levels", () => {
  const leaf = (id: string, to: string) => ({
    schema: "nuhokai/node@1" as const,
    id,
    name: id,
    parent: null,
    external: false,
    abstract: false,
    purpose: id,
    status: "planned" as const,
    source: [],
    edges: [{ kind: "uses" as const, to, port: ["p"] }],
  });
  const view = scopeView(
    mapScene({
      id: "w",
      nodes: [leaf("a", "b"), leaf("b", "a")],
      placeholders: [],
      file: "nuhokai/index.ts",
      parents: [null, null],
      listings: [],
      orphans: [],
      files: [],
    }),
    null,
  );

  expect(view.items.map((item) => (item.kind === "island" ? item.level : null))).toEqual([1, 0]);
});

test("the click panel shows Orders' own NodeSpec fields only", () => {
  const orders = world.nodes[indexOf("Orders")];
  if (!orders) throw new Error("no Orders");
  const details = detailsOf(orders);

  expect(details).toEqual({
    name: "Orders",
    status: "planned",
    kind: null,
    purpose: orders.purpose,
    sections: [
      {
        label: "Ports",
        rows: [
          { name: "place", meta: "call · Place an order" },
          { name: "cancelled", meta: "event · An order was cancelled" },
        ],
      },
      { label: "Requirements", rows: [] },
      { label: "Source", rows: [] },
    ],
  });
  expect(detailsOf(world.nodes[indexOf("Postgres")] ?? orders).kind).toBe("external db");
  expect(detailsOf(world.nodes[indexOf("AuditLog")] ?? orders).sections[1]?.rows).toEqual([
    { name: "R1", meta: "Every change is listed with author and time." },
  ]);
});

test("the click panel shows a node without source, as a world file may hold one", () => {
  const orders = world.nodes[indexOf("Orders")];
  if (!orders) throw new Error("no Orders");
  const { source: _source, ...unsourced } = orders;

  expect(detailsOf(unsourced as typeof orders).sections.at(-1)).toEqual({ label: "Source", rows: [] });
});

test("two holes sharing a description stay two, each with its sorted users", () => {
  const leaf = (id: string) => ({
    schema: "nuhokai/node@1" as const,
    id,
    name: id,
    parent: null,
    external: false,
    abstract: false,
    purpose: id,
    status: "planned" as const,
    source: [],
  });
  const loaded: LoadedWorld = {
    id: "w",
    nodes: [leaf("a"), leaf("b"), leaf("c")],
    placeholders: [
      { kind: "call", description: "notify", users: ["c", "a"] },
      { kind: "call", description: "notify", users: ["b"] },
    ],
    file: "nuhokai/index.ts",
    parents: [null, null, null],
    listings: [],
    orphans: [],
    files: [],
  };

  const holes = scopeView(mapScene(loaded), null).items.filter((item) => item.kind === "hole");

  expect(holes.map((hole) => [hole.name, hole.kind === "hole" ? hole.users : []])).toEqual([
    ["notify", ["a", "c"]],
    ["notify", ["b"]],
  ]);
});
