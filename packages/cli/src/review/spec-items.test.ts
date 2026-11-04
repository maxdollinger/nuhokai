import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCliFiles } from "../init/cli-files.ts";
import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { find, list, type SpecItem } from "./spec-items.ts";
import { at } from "./test-world.ts";

let shop: LoadedWorld;
let temp = "";

const SHOP = `import { node } from "@nuhokai/world";
export const Store = node({
  id: "store",
  purpose: "A place to keep things.",
  status: "planned",
  source: [],
  abstract: true,
  ports: { keep: { kind: "call", purpose: "Keep one thing" } },
  requirements: [{ id: "R1", text: "Keeps what it is given." }, { id: "R2", text: "Gives it back." }],
  testCases: [{ text: "Keep a box → it is kept.", demonstrates: ["R1"] }],
}).edges({});
export const Orders = node({
  id: "orders",
  purpose: "Owns orders.",
  status: "building",
  source: ["src/orders.ts"],
  ports: { place: { kind: "event", purpose: "An order was placed", payload: "the order" } },
  requirements: [
    { id: "R1", text: "Places orders." },
    { id: "R2", text: "Never loses one." },
    { id: "C1", kind: "constraint", text: "No network." },
  ],
  testCases: [{ text: "Place one → placed.", demonstrates: ["R1"] }],
  decisions: [
    {
      decision: "Orders own their ids.",
      why: "One source of truth.",
      rejected: [{ option: "A shared id service", why: "One more hop." }],
    },
  ],
}).edges({ implements: () => [Store], uses: () => [Stock.reserve, Lost.run, Stock.count] });
export const Stock = node({
  id: "stock",
  purpose: "Counts stock.",
  status: "planned",
  source: [],
  ports: { reserve: { kind: "call", purpose: "Reserve" }, count: { kind: "call", purpose: "Count" } },
}).edges({});
export const Lost = node({
  id: "lost",
  purpose: "Listed nowhere.",
  status: "planned",
  source: [],
  ports: { run: { kind: "call", purpose: "Run" } },
}).edges({});
`;

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), "nuhokai-spec-items-"));
  mkdirSync(join(temp, "nuhokai"));
  writeFileSync(
    join(temp, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { Orders, Stock, Store } from "./shop.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [Store, Stock, Orders] });
`,
  );
  writeFileSync(join(temp, "nuhokai/shop.ts"), SHOP);
  writeCliFiles(temp);
  shop = await loadWorld(temp);
});

afterAll(() => {
  if (temp) rmSync(temp, { recursive: true, force: true });
});

/** The line of `file` holding `text`, from 1. */
function lineOf(file: string, text: string): number {
  return (
    readFileSync(file, "utf8")
      .split("\n")
      .findIndex((line) => line.includes(text)) + 1
  );
}

test("R1, R2, R3, R6: items by reference in spec order, each at its line; details below their item; a contract's items prefixed by its name", () => {
  const items = list(shop, at(shop, "Orders"));
  expect(items.map((item) => item.ref)).toEqual([
    "purpose",
    "ports.place",
    "requirements[R1]",
    "requirements[R2]",
    "requirements[C1]",
    "edges.uses[Stock]",
    "edges.uses[Lost]",
    "testCases[0]",
    "decisions[0]",
    "Store.ports.keep",
    "Store.requirements[R1]",
    "Store.requirements[R2]",
    "Store.testCases[0]",
  ]);
  const file = join(temp, "nuhokai/shop.ts");
  expect(find(items, "requirements[R1]")).toMatchObject({ kind: "requirement", file, line: lineOf(file, "Places") });
  // One item per target, its ports merged, at the edge's first item; an orphan by its export name, never dropped.
  expect(find(items, "edges.uses[Stock]")).toMatchObject({ text: "uses Stock: reserve, count", line: 31 });
  expect(find(items, "edges.uses[Lost]")).toMatchObject({ text: "uses Lost: run", line: 31 });
  expect(find(items, "ports.place")?.details).toEqual(["payload: the order"]);
  expect(find(items, "ports.place.payload")).toBeUndefined();
  expect(find(items, "decisions[0]")).toMatchObject({
    text: "Orders own their ids. Why: One source of truth.",
    details: ["rejected: A shared id service Why not: One more hop."],
  });
  expect(find(items, "decisions[0].rejected[0]")).toBeUndefined();
  expect(find(items, "Store.requirements[R1]")).toMatchObject({ file, line: 9, contract: "Store" });
  expect(find(items, "Store.testCases[0]")).toMatchObject({ line: 10, contract: "Store" });
  expect(find(items, "Store.purpose")).toBeUndefined();
});

test("R4: a requirement of the node's own no test case demonstrates is marked untested; a constraint never is", () => {
  const items = list(shop, at(shop, "Orders"));
  expect(find(items, "requirements[R1]")?.untested).toBeUndefined();
  expect(find(items, "requirements[R2]")?.untested).toBe(true);
  expect(find(items, "requirements[C1]")).toMatchObject({ kind: "constraint" });
  expect(find(items, "requirements[C1]")?.untested).toBeUndefined();
});

test("R5: find is exact, case-sensitive, and takes a reference as the prompt prints it; the same node, the same items", () => {
  const listed = list(shop, at(shop, "Orders"));
  expect(find(listed, "Store.requirements[R1]")?.contract).toBe("Store");
  expect(find(listed, "requirements[r1]")).toBeUndefined();
  expect(list(shop, at(shop, "Orders"))).toEqual(listed);
  const items: SpecItem[] = [{ ref: "requirements[R  1]", kind: "requirement", text: "t", file: "nuhokai/a.ts" }];
  expect(find(items, "requirements[R 1]")?.ref).toBe("requirements[R  1]");
  expect(find(items, "requirements[R  1]")).toBeUndefined();
});
