import { expect, test } from "bun:test";
import type { NodeSpec } from "@nuhokai/world/node-spec";
import { CliError } from "./failure.ts";
import { findNode, nodePaths } from "./node-path.ts";

/** A world's shape: each node by name and id, under its parent's position. */
function tree(entries: readonly [name: string, parent: number | null, id?: string][]) {
  return {
    nodes: entries.map(([name, , id]) => ({ name, id: id ?? name }) as unknown as NodeSpec),
    parents: entries.map(([, parent]) => parent),
  };
}

/** The example world's shape, in LoadWorld's walk order. */
const example = tree([
  ["Postgres", null],
  ["AuditLog", null],
  ["Shop", null],
  ["Orders", 2],
  ["Stock", 2],
]);

function failure(world: ReturnType<typeof tree>, typed: string): string {
  try {
    findNode(world, typed);
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return (error as Error).message;
  }
  throw new Error(`findNode found ${typed}`);
}

test("NodePath R1, R2: paths from the top level down, in nodes order, by position not id", () => {
  expect(nodePaths(example)).toEqual(["Postgres", "AuditLog", "Shop", "Shop/Orders", "Shop/Stock"]);
  // C1 shares P's id: C2 is still P's child.
  expect(
    nodePaths(
      tree([
        ["P", null, "x"],
        ["C1", 0, "x"],
        ["C2", 0],
      ]),
    ),
  ).toEqual(["P", "P/C1", "P/C2"]);
});

test("NodePath R3: exact, case-sensitive, one trailing / allowed", () => {
  expect(findNode(example, "Shop/Stock")).toBe(4);
  expect(findNode(example, "Shop/Stock/")).toBe(4);
  expect(findNode(example, "Shop/")).toBe(2);
  expect(findNode(example, "Postgres")).toBe(0);
});

test("NodePath R4: a miss names the closest name, else how to list the deepest node found", () => {
  expect(failure(example, "shop/stock")).toBe("no node shop/stock; did you mean Shop/Stock?");
  expect(failure(example, "Shop/Stok")).toBe("no node Shop/Stok; did you mean Shop/Stock?");
  expect(failure(example, "Shp")).toBe("no node Shp; did you mean Shop?");
  expect(failure(example, "Shop/Basket")).toBe("no node Shop/Basket; nuhokai tree Shop lists its children");
  expect(failure(example, "Basket")).toBe("no node Basket; nuhokai tree lists the top level");
  expect(failure(example, "Shop/Stock/Item")).toBe(
    "no node Shop/Stock/Item; nuhokai tree Shop/Stock lists its children",
  );
});

test("NodePath R4: the rest of the path is corrected as far as it has close names", () => {
  expect(failure(example, "Shp/Stock")).toBe("no node Shp/Stock; did you mean Shop/Stock?");
  expect(failure(example, "Shp/Basket")).toBe("no node Shp/Basket; did you mean Shop?");
  expect(failure(example, "shop/stok")).toBe("no node shop/stok; did you mean Shop/Stock?");
});

test("NodePath R3: an empty path or segment names no node", () => {
  for (const typed of ["", "/Shop", "Shop//Stock", "//"]) expect(failure(example, typed)).toStartWith("no node ");
});

test("NodePath R5: siblings sharing a name make their path ambiguous; paths still names both", () => {
  const clash = tree([
    ["Orders", null, "a"],
    ["Orders", null, "b"],
  ]);
  expect(failure(clash, "Orders")).toBe("Orders names 2 siblings; nuhokai check reports the clash");
  expect(nodePaths(clash)).toEqual(["Orders", "Orders"]);
});
