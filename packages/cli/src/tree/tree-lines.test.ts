import { expect, test } from "bun:test";
import type { NodeSpec } from "@nuhokai/world/node-spec";
import type { LoadedWorld } from "../load/load-world.ts";
import { nameNodes } from "../shared/node-path.ts";
import { renderTree } from "./tree-lines.ts";

/** A loaded world's tree part: each node's name, parent position, source, what and why, its path as NodePath names it. */
function world(
  entries: readonly [name: string, parent: number | null, source: unknown, what: unknown, why?: unknown][],
) {
  const paths = nameNodes(entries.map(([name, parent]) => ({ name, parent })));
  const nodes = entries.map(([name, parent, source, what, why], index) => ({
    index,
    spec: { name, id: name, source, what, why } as unknown as NodeSpec,
    parent,
    children: entries.flatMap(([, above], child) => (above === index ? [child] : [])),
    path: paths[index] ?? "",
    file: "nuhokai/index.ts",
  }));
  return {
    nodes,
    top: nodes.filter((node) => node.parent === null).map((node) => node.index),
  } as unknown as LoadedWorld;
}

/** The example world's shape, whats and whys, in LoadWorld's walk order. */
const example = world([
  ["Postgres", null, [], "The shared database, run by ops."],
  ["AuditLog", null, [], "Records who changed which entity.", "So compliance can read it."],
  ["Shop", null, [], "The shop backend.", "One boundary around everything a customer interacts with."],
  ["Orders", 2, [], "Takes an order from checkout to delivery.", "So the order lifecycle has one owner."],
  ["Stock", 2, [], "Counts what is on the shelf.", "So Orders never oversells."],
]);

test("TreeLines R1, R4, R5: the top level at level 1, a dome below it collapsed with its child count", () => {
  expect(renderTree(example, ".", null, 1)).toEqual([
    "Postgres | (none) | The shared database, run by ops.",
    "AuditLog | (none) | Records who changed which entity. Why: So compliance can read it.",
    "Shop/ (2) | (none) | The shop backend. Why: One boundary around everything a customer interacts with.",
  ]);
});

test("TreeLines R4: level 0 prints every node, none collapsed, parent before children", () => {
  expect(renderTree(example, ".", null, 0).map((line) => line.split(" | ")[0])).toEqual([
    "Postgres",
    "AuditLog",
    "Shop",
    "Shop/Orders",
    "Shop/Stock",
  ]);
});

test("TreeLines R4, R5: a start prints itself, then its descendants down to the level below it", () => {
  const paths = (start: number, level: number) =>
    renderTree(example, ".", start, level).map((line) => line.split(" | ")[0]);
  expect(paths(2, 1)).toEqual(["Shop", "Shop/Orders", "Shop/Stock"]);
  expect(paths(3, 1)).toEqual(["Shop/Orders"]);
  expect(paths(2, 0)).toEqual(["Shop", "Shop/Orders", "Shop/Stock"]);
});

test("TreeLines R4, R5: levels count down nested domes", () => {
  const deep = world([
    ["A", null, [], "a"],
    ["B", 0, [], "b"],
    ["C", 1, [], "c"],
  ]);
  expect(renderTree(deep, ".", null, 2).map((line) => line.split(" | ")[0])).toEqual(["A", "A/B/ (1)"]);
  expect(renderTree(deep, ".", 0, 1).map((line) => line.split(" | ")[0])).toEqual(["A", "A/B/ (1)"]);
  expect(renderTree(deep, ".", 0, 2).map((line) => line.split(" | ")[0])).toEqual(["A", "A/B", "A/B/C"]);
});

test("TreeLines R2: sources in authored order, comma-separated, named from the cwd", () => {
  const sourced = world([["App", null, ["src/a.ts", "src/b/**"], "app"]]);
  expect(renderTree(sourced, "packages/app", null, 1)).toEqual([
    "App | packages/app/src/a.ts, packages/app/src/b/** | app",
  ]);
  expect(renderTree(sourced, ".", null, 1)).toEqual(["App | src/a.ts, src/b/** | app"]);
  expect(renderTree(world([["Abs", null, ["/etc/x"], "abs"]]), "app", null, 1)).toEqual(["Abs | /etc/x | abs"]);
});

test("TreeLines R3, R6: what and why are one line with single spaces; the same input gives the same lines", () => {
  const spaced = world([["A", null, [], "  First line,\n  second   line. ", " Because\n  so. "]]);
  expect(renderTree(spaced, ".", null, 1)).toEqual(["A | (none) | First line, second line. Why: Because so."]);
  expect(renderTree(spaced, ".", null, 1)).toEqual(renderTree(spaced, ".", null, 1));
});

test("TreeLines R3: no field breaks the line or passes a control code, whatever an unchecked world holds", () => {
  const hostile = world([["a\nINJECTED | fake", null, ["src/\u001b[31mred.ts"], "\u001b[2Jclear\r\nnext"]]);
  expect(renderTree(hostile, ".", null, 1)).toEqual(["a INJECTED | fake | src/ [31mred.ts | [2Jclear next"]);
});

test("TreeLines: an unchecked world's odd source, what or why prints, never crashes", () => {
  const odd = world([["A", null, "src/**", 42, 7]]);
  expect(renderTree(odd, ".", null, 1)).toEqual(["A | (none) | "]);
});
