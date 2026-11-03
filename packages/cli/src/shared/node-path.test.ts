import { expect, test } from "bun:test";
import type { NodeSpec } from "@nuhokai/world/node-spec";
import { CliError } from "./failure.ts";
import { childrenOf, findNode, nameNodes } from "./node-path.ts";

/** A world's shape: each node by name and id, under its parent's position. */
function hierarchy(entries: readonly [name: string, parent: number | null, id?: string][]) {
  return {
    nodes: entries.map(([name, , id]) => ({ name, id: id ?? name }) as unknown as NodeSpec),
    parents: entries.map(([, parent]) => parent),
  };
}

/** The example world's shape, in LoadWorld's walk order. */
const example = hierarchy([
  ["Postgres", null],
  ["AuditLog", null],
  ["Shop", null],
  ["Orders", 2],
  ["Stock", 2],
]);

function failure(world: ReturnType<typeof hierarchy>, typed: string, root = "."): string {
  try {
    findNode(world, typed, root);
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return (error as Error).message;
  }
  throw new Error(`findNode found ${typed}`);
}

test("NodePath R1, R2: paths from the top level down, in nodes order, by position not id", () => {
  expect(nameNodes(example)).toEqual(["Postgres", "AuditLog", "Shop", "Shop/Orders", "Shop/Stock"]);
  // C1 shares P's id: C2 is still P's child.
  expect(
    nameNodes(
      hierarchy([
        ["P", null, "x"],
        ["C1", 0, "x"],
        ["C2", 0],
      ]),
    ),
  ).toEqual(["P", "P/C1", "P/C2"]);
});

test("childrenOf: each node's direct children by position, the top level under null, in walk order", () => {
  expect([...childrenOf(example)]).toEqual([
    [null, [0, 1, 2]],
    [2, [3, 4]],
  ]);
});

test("NodePath R3: exact, case-sensitive, one trailing / allowed", () => {
  expect(findNode(example, "Shop/Stock", ".")).toBe(4);
  expect(findNode(example, "Shop/Stock/", ".")).toBe(4);
  expect(findNode(example, "Shop/", ".")).toBe(2);
  expect(findNode(example, "Postgres", ".")).toBe(0);
});

test("NodePath R4: a miss names the closest name, else the command listing the deepest node found", () => {
  expect(failure(example, "shop/stock")).toBe("no node 'shop/stock'; did you mean 'Shop/Stock'?");
  expect(failure(example, "Shop/Stok")).toBe("no node 'Shop/Stok'; did you mean 'Shop/Stock'?");
  expect(failure(example, "Shp")).toBe("no node 'Shp'; did you mean 'Shop'?");
  expect(failure(example, "Shop/Basket")).toBe("no node 'Shop/Basket'; `nuhokai tree Shop` lists its children");
  expect(failure(example, "Basket")).toBe("no node 'Basket'; `nuhokai tree` lists the top level");
  expect(failure(example, "Shop/Stock/Item")).toBe(
    "no node 'Shop/Stock/Item'; `nuhokai tree Shop/Stock` lists its children",
  );
});

test("NodePath R4: a command in a message carries --path, quoted where a shell needs it", () => {
  expect(failure(example, "Shop/Basket", "packages/cli")).toBe(
    "no node 'Shop/Basket'; `nuhokai tree Shop --path packages/cli` lists its children",
  );
  expect(failure(example, "Basket", "my app")).toBe(
    "no node 'Basket'; `nuhokai tree --path 'my app'` lists the top level",
  );
  const spaced = hierarchy([
    ["Two Words", null],
    ["Child", 0],
  ]);
  expect(failure(spaced, "Two Words/Kid")).toBe(
    "no node 'Two Words/Kid'; `nuhokai tree 'Two Words'` lists its children",
  );
});

test("NodePath R4: the rest of the path is corrected as far as it has close names", () => {
  expect(failure(example, "Shp/Stock")).toBe("no node 'Shp/Stock'; did you mean 'Shop/Stock'?");
  expect(failure(example, "Shp/Basket")).toBe("no node 'Shp/Basket'; did you mean 'Shop'?");
  expect(failure(example, "shop/stok")).toBe("no node 'shop/stok'; did you mean 'Shop/Stock'?");
});

test("NodePath R3: an empty path or segment names no node", () => {
  for (const typed of ["", "/Shop", "Shop//Stock", "//"]) {
    expect(failure(example, typed)).toStartWith(`no node '${typed}'; a node path is names joined by single /`);
  }
});

test("NodePath R3: a node whose name holds / is reported, not suggested away", () => {
  const slashed = hierarchy([["Ex/ample", null]]);
  expect(nameNodes(slashed)).toEqual(["Ex/ample"]);
  expect(failure(slashed, "Ex/ample")).toBe(
    "no node 'Ex/ample': a name on it holds /, which a node path cannot address; rename the node",
  );
});

test("NodePath R5: siblings sharing a name make their path ambiguous; paths still names both", () => {
  const clash = hierarchy([
    ["Orders", null, "a"],
    ["Orders", null, "b"],
  ]);
  expect(failure(clash, "Orders")).toBe("'Orders' names 2 siblings; `nuhokai check` reports the clash");
  expect(failure(clash, "Orders", "app")).toBe(
    "'Orders' names 2 siblings; `nuhokai check --path app` reports the clash",
  );
  expect(nameNodes(clash)).toEqual(["Orders", "Orders"]);
});
