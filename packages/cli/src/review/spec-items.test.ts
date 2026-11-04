import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { writeCliFiles } from "../init/cli-files.ts";
import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { find, list, type SpecItem } from "./spec-items.ts";

/** The CLI's own world, named from the cwd as a command names it. */
const ROOT = relative(process.cwd(), join(import.meta.dir, "../..")) || ".";
let own: LoadedWorld;
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
  requirements: [{ id: "R1", text: "Keeps what it is given." }],
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
}).edges({ implements: () => [Store], uses: () => [Lost.run] });
export const Lost = node({
  id: "lost",
  purpose: "Listed nowhere.",
  status: "planned",
  source: [],
  ports: { run: { kind: "call", purpose: "Run" } },
}).edges({});
`;

beforeAll(async () => {
  own = await loadWorld(ROOT);
  temp = mkdtempSync(join(tmpdir(), "nuhokai-spec-items-"));
  mkdirSync(join(temp, "nuhokai"));
  writeFileSync(
    join(temp, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { Orders, Store } from "./shop.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [Store, Orders] });
`,
  );
  writeFileSync(join(temp, "nuhokai/shop.ts"), SHOP);
  writeCliFiles(temp);
  shop = await loadWorld(temp);
});

afterAll(() => {
  if (temp) rmSync(temp, { recursive: true, force: true });
});

/** The position of the node at a hierarchy path. */
function at(world: LoadedWorld, path: string): number {
  const node = world.nodes.find((candidate) => candidate.path === path);
  if (!node) throw new Error(`no ${path}`);
  return node.index;
}

test("R1, R3: PrintTree's items by reference, each at its line in its spec file, in spec order", () => {
  const items = list(own, at(own, "Tree/PrintTree"));
  expect(items.map((item) => item.ref)).toEqual([
    "purpose",
    "ports.run",
    "requirements[R1]",
    "requirements[R2]",
    "requirements[R3]",
    "edges.uses[LoadWorld]",
    "edges.uses[Path]",
    "edges.uses[TreeLines]",
    "edges.uses[Failure]",
    "testCases[0]",
    "testCases[1]",
  ]);
  const file = `${ROOT === "." ? "" : `${ROOT}/`}nuhokai/tree/print-tree.ts`;
  const r1 = find(items, "requirements[R1]");
  expect(r1).toMatchObject({ kind: "requirement", file });
  expect(r1?.text).toStartWith("Order: load, find the start");
  expect(items.every((item) => item.file === file && typeof item.line === "number")).toBe(true);
  // Each line is where the item was written: the requirement's object starts there, its id right below.
  const lines = readFileSync(file, "utf8").split("\n");
  expect(lines.slice((r1?.line ?? 0) - 1, r1?.line).join("\n")).toMatch(/\{\s*$/);
  expect(lines[r1?.line ?? 0]).toContain('id: "R1"');
  expect(find(items, "edges.uses[Failure]")?.text).toBe("uses Failure: format, report");
  // A port's shapes and errors are listed below it, cited by the port's own reference.
  const run = find(items, "ports.run");
  expect(run?.details?.[0]).toStartWith("input: ");
  expect(run?.details?.[1]).toStartWith("output: ");
  expect(run?.details?.slice(2).every((detail) => detail.startsWith("error: "))).toBe(true);
  expect(run?.details).toHaveLength(7);
  expect(find(items, "ports.run.input")).toBeUndefined();
});

test("R1, R2, R5, R6: details below their item, a contract's items prefixed by its name, an orphan by its name; find is exact", () => {
  const items = list(shop, at(shop, "Orders"));
  const refs = items.map((item) => item.ref);
  expect(refs).toEqual([
    "purpose",
    "ports.place",
    "requirements[R1]",
    "requirements[R2]",
    "requirements[C1]",
    "edges.uses[Lost]",
    "testCases[0]",
    "decisions[0]",
    "Store.ports.keep",
    "Store.requirements[R1]",
    "Store.testCases[0]",
  ]);
  expect(find(items, "ports.place")?.details).toEqual(["payload: the order"]);
  expect(find(items, "decisions[0]")).toMatchObject({
    text: "Orders own their ids. Why: One source of truth.",
    details: ["rejected: A shared id service Why not: One more hop."],
  });
  expect(find(items, "decisions[0].rejected[0]")).toBeUndefined();
  // A uses edge to a node the world never reaches is cited by its export name, marked unreachable (R6).
  expect(find(items, "edges.uses[Lost]")).toMatchObject({ text: "uses Lost: run", unreachable: true });
  const inherited = find(items, "Store.requirements[R1]");
  expect(inherited).toMatchObject({ file: join(temp, "nuhokai/shop.ts"), line: 9, contract: "Store" });
  expect(find(items, "Store.testCases[0]")).toMatchObject({ line: 10, contract: "Store" });
  expect(find(items, "requirements[r1]")).toBeUndefined();
  expect(find(items, "Store.purpose")).toBeUndefined();
  // Same world and node, the same items.
  expect(list(shop, at(shop, "Orders"))).toEqual(items);
});

test("R4: a requirement no test case demonstrates is marked untested; a constraint never is", () => {
  const items = list(shop, at(shop, "Orders"));
  expect(find(items, "requirements[R1]")?.untested).toBeUndefined();
  expect(find(items, "requirements[R2]")?.untested).toBe(true);
  expect(find(items, "requirements[C1]")).toMatchObject({ kind: "constraint" });
  expect(find(items, "requirements[C1]")?.untested).toBeUndefined();
});

test("R5: find takes a reference as the prompt prints it, each run of whitespace one space", () => {
  const items: SpecItem[] = [{ ref: "requirements[R  1]", kind: "requirement", text: "t", file: "nuhokai/a.ts" }];
  expect(find(items, "requirements[R 1]")?.ref).toBe("requirements[R  1]");
  expect(find(items, "requirements[R  1]")).toBeUndefined();
});
