import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { detailsOf, lightsFor, mapScene, type ScopeView, scopeView, search } from "./scene.js";

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

const labels = (query: string) => search(scene, query).map((hit) => hit.label);
const key = (name: string) => `node:${indexOf(name)}`;

test("search ranks exact, prefix, word starts, substring, subsequence; ties: nodes, holes, ports, world order", () => {
  const or = search(scene, "or");
  expect(or.map((hit) => hit.label)).toEqual([
    "Orders",
    "Shop › orderHistory",
    `tbd: ${HOLE}`,
    "Shop › placeOrder",
    "AuditLog › history",
  ]);
  expect(or.map((hit) => hit.tier)).toEqual([2, 2, 3, 3, 4]);
  expect(or.map((hit) => hit.positions)).toEqual([
    [0, 1],
    [7, 8],
    [32, 33],
    [12, 13],
    [15, 16],
  ]);

  // All subsequences: spans 4, 4, 4 and 6, so tightness beats Postgres being the first node.
  const ore = search(scene, "ore");
  expect(ore.map((hit) => hit.label)).toEqual(["Orders", "Shop › placeOrder", "Shop › orderHistory", "Postgres"]);
  expect(ore.map((hit) => hit.positions)).toEqual([
    [0, 1, 3],
    [12, 13, 15],
    [7, 8, 10],
    [1, 5, 6],
  ]);
});

test("search: case-insensitive, word starts on camelCase, holes stop at substring", () => {
  expect(search(scene, "STOCK")).toMatchObject([{ label: "Stock", tier: 1, positions: [0, 1, 2, 3, 4] }]);
  expect(search(scene, "al")).toMatchObject([{ label: "AuditLog", tier: 3, positions: [0, 5] }]);
  // The hole holds h, i, s, t in order ("that", "their", "push", "not"), but holes are never subsequences.
  expect(search(scene, "hist")).toMatchObject([
    { label: "AuditLog › history", tier: 2, positions: [11, 12, 13, 14] },
    { label: "Shop › orderHistory", tier: 3, positions: [12, 13, 14, 15] },
  ]);
});

test("search: subsequences from 3 characters; a blank query finds nothing", () => {
  expect(labels("pg")).toEqual([]);
  expect(search(scene, "pgs")).toMatchObject([{ label: "Postgres", tier: 5, positions: [0, 4, 7] }]);
  expect(search(scene, "")).toEqual([]);
  expect(search(scene, "   ")).toEqual([]);
});

test("a hit lands in its home scope: a node's parent, a port's node, a hole once where all its users are", () => {
  const shop = indexOf("Shop");
  expect(search(scene, "stock")).toEqual([
    {
      kind: "node",
      label: "Stock",
      positions: [0, 1, 2, 3, 4],
      tier: 1,
      scope: shop,
      path: [
        { scope: null, name: "Shop" },
        { scope: shop, name: "Shop" },
      ],
      key: key("Stock"),
      node: indexOf("Stock"),
    },
  ]);
  // A dome lands where it is drawn, not inside itself.
  expect(search(scene, "shop")).toMatchObject([
    { kind: "node", scope: null, key: key("Shop"), path: [{ scope: null, name: "Shop" }] },
  ]);
  expect(search(scene, "reserve")).toMatchObject([
    { kind: "port", label: "Stock › reserve", scope: shop, key: key("Stock"), node: indexOf("Stock") },
  ]);
  // Drawn on top and inside Shop, found once: in Shop, where Orders and Stock are islands.
  expect(search(scene, "customer")).toEqual([
    {
      kind: "hole",
      label: `tbd: ${HOLE}`,
      positions: [12, 13, 14, 15, 16, 17, 18, 19],
      tier: 3,
      scope: shop,
      path: [
        { scope: null, name: "Shop" },
        { scope: shop, name: "Shop" },
      ],
      key: "tbd:0",
      node: null,
    },
  ]);
});

test("a hole's home is the deepest scope holding all its users", () => {
  const leaf = (id: string, parent: string | null = null) => ({
    schema: "nuhokai/node@1" as const,
    id,
    name: id,
    parent,
    external: false,
    abstract: false,
    purpose: id,
    status: "planned" as const,
    source: [],
  });
  const nested = mapScene({
    id: "w",
    nodes: [leaf("a"), leaf("b"), leaf("c", "b")],
    placeholders: [
      { kind: "call", description: "notify", users: ["c", "a"] },
      { kind: "call", description: "log", users: ["c"] },
    ],
    file: "nuhokai/index.ts",
    parents: [null, null, 1],
    listings: [],
    orphans: [],
    files: [],
  });

  expect(search(nested, "notify")).toMatchObject([{ kind: "hole", scope: null, key: "tbd:0" }]);
  expect(search(nested, "log")).toMatchObject([
    {
      kind: "hole",
      scope: 1,
      key: "tbd:1",
      path: [
        { scope: null, name: "World" },
        { scope: 1, name: "b" },
      ],
    },
  ]);
  expect(lightsFor(nested, scopeView(nested, 1), search(nested, "notify"))).toEqual(["tbd:0"]);
});

test("a query lights what stands for each hit in the open scope", () => {
  const top = scopeView(scene, null);
  const shop = scopeView(scene, indexOf("Shop"));
  const lights = (view: ScopeView, query: string) => lightsFor(scene, view, search(scene, query));

  // A nested hit lights its dome; a port its node's stand-in; each item once, in hit order.
  expect(lights(top, "stock")).toEqual([key("Shop")]);
  expect(lights(top, "reserve")).toEqual([key("Shop")]);
  expect(lights(top, "customer")).toEqual(["tbd:0"]);
  expect(lights(top, "or")).toEqual([key("Shop"), "tbd:0", key("AuditLog")]);

  expect(lights(shop, "stock")).toEqual([key("Stock")]);
  expect(lights(shop, "audit")).toEqual([key("AuditLog")]); // its outside proxy
  expect(lights(shop, "postgres")).toEqual([key("Postgres")]); // an external
  expect(lights(shop, "shop")).toEqual([]); // the open dome is not drawn in itself
});
