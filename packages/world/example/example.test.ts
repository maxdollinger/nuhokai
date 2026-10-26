import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NodeRef, PortRef } from "../src/index.ts";
import exampleWorld, * as world from "./index.ts";

// Every node file (type-errors.ts is compile-time only and never evaluated), by file name.
const files = readdirSync(import.meta.dir).filter(
  (file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !["index.ts", "type-errors.ts"].includes(file),
);
const modules = await Promise.all(
  files.map(async (file) => [file, (await import(join(import.meta.dir, file))) as Record<string, unknown>] as const),
);
const isNode = (value: unknown): value is NodeRef => (value as { $ref?: unknown } | null)?.$ref === "node";
const nodes = modules.flatMap(([file, exports]) =>
  Object.entries(exports).flatMap(([name, value]) => (isNode(value) ? [{ file, name, node: value }] : [])),
);

/** Every lazy edge of a node, evaluated, labelled for failure messages. */
function edgesOf(node: NodeRef): [string, unknown][] {
  const { uses, implements: impl } = node.$def;
  return [
    ...(uses?.() ?? []).map((ref, i): [string, unknown] => [`uses[${i}]`, ref]),
    ...(impl?.() ?? []).map((ref, i): [string, unknown] => [`implements[${i}]`, ref]),
  ];
}

/** A node's direct children, from its `children` record. */
const childrenOf = (node: NodeRef): NodeRef[] => Object.values(node.$def.children ?? {});

/** Every node in the world tree with its parent (`null` at the top level), depth first. */
function walk(nodes: readonly NodeRef[], parent: NodeRef | null = null): { node: NodeRef; parent: NodeRef | null }[] {
  return nodes.flatMap((node) => [{ node, parent }, ...walk(childrenOf(node), node)]);
}
const placed = walk(exampleWorld.children);
const parentOf = (node: NodeRef) => placed.find((entry) => entry.node === node)?.parent;

describe("example world", () => {
  test("has at least three nodes in at least three files", () => {
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(nodes.map(({ file }) => file)).size).toBeGreaterThanOrEqual(3);
  });

  test("index.ts exports every node", () => {
    for (const { name, node } of nodes) expect((world as Record<string, unknown>)[name], name).toBe(node);
  });

  test("evaluating every lazy edge yields only references, never undefined", () => {
    for (const { name, node } of nodes) {
      for (const [edge, ref] of edgesOf(node)) {
        expect(ref, `${name}.${edge}`).toBeDefined();
        expect(["node", "port", "inherited", "unresolved"], `${name}.${edge}`).toContain(
          (ref as { $ref: string }).$ref,
        );
      }
    }
  });

  test("the Orders <-> Stock cycle resolves in both directions", () => {
    expect(world.Orders.$def.uses?.()).toContain(world.Stock.reserve);
    expect(world.Stock.$def.uses?.()).toContain(world.Orders.cancelled);
    expect(world.Stock.reserve.node).toBe(world.Stock);
  });

  test("index.ts lists every exported node exactly once, and nothing else", () => {
    expect(exampleWorld.$ref).toBe("world");
    expect(placed.map(({ node }) => node.$ref)).toEqual(placed.map(() => "node"));
    expect(new Set(placed.map(({ node }) => node)).size).toBe(placed.length);
    expect(new Set(placed.map(({ node }) => node.$def.id)).size).toBe(placed.length);
    expect(new Set(placed.map(({ node }) => node))).toEqual(new Set(nodes.map(({ node }) => node)));
  });

  test("the tree places children under their parent; externals and contracts are top level", () => {
    expect(parentOf(world.Orders)).toBe(world.Shop);
    expect(parentOf(world.Stock)).toBe(world.Shop);
    expect(parentOf(world.Shop)).toBeNull();
    expect(parentOf(world.Postgres)).toBeNull();
    expect(parentOf(world.AuditLog)).toBeNull();
  });

  test("a leaf declares its own ports; a dome delegates every port to a direct child port", () => {
    expect(Object.keys(world.Orders.ports).sort()).toEqual(["cancelled", "place"]);
    for (const { name, node } of nodes) {
      for (const [port, def] of Object.entries(node.$def.ports ?? {})) {
        if (!childrenOf(node).length) continue;
        const target = def.delegate;
        expect(target, `${name}.${port}`).toBeDefined();
        const child = childrenOf(node).find((candidate) => candidate.$def.id === target?.to);
        expect(child, `${name}.${port}`).toBeDefined();
        const own = child?.$def.ports?.[target?.port ?? ""];
        const inheritedPort = child?.$def.implements?.().some((contract) => contract.$def.ports?.[target?.port ?? ""]);
        expect(own ?? inheritedPort, `${name}.${port}`).toBeTruthy();
      }
    }
    expect(world.Shop.$def.ports?.placeOrder?.delegate).toEqual({ to: world.Orders.$def.id, port: "place" });
    expect(world.Shop.placeOrder.node).toBe(world.Shop);
    expect(world.Shop.ports.placeOrder).toBe(world.Shop.placeOrder);
  });

  test("node files never import the world file", () => {
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    for (const file of files) {
      const imports = transpiler.scanImports(readFileSync(join(import.meta.dir, file), "utf8")).map((i) => i.path);
      expect(imports, file).not.toContain("./index.ts");
    }
  });

  test("a dome exposes a port its child inherited", () => {
    const def = world.Shop.$def.ports?.orderHistory;
    expect(def?.delegate).toEqual({ to: world.Orders.$def.id, port: "history" });
    expect(def?.kind).toBe("call");
    if (def?.kind === "call") expect(def.input).toBe("entity id");
    expect(world.Shop.orderHistory.node).toBe(world.Shop);
    expect(world.Orders.$def.implements?.()).toEqual([world.AuditLog]);
  });

  test("two nodes depend on the same placeholder", () => {
    const dependents = nodes.filter(({ node }) => node.$def.uses?.().includes(world.notifyCustomer));
    expect(dependents.map(({ name }) => name).sort()).toEqual(["Orders", "Stock"]);
  });

  test("placeholders are distinguishable from real port references at runtime", () => {
    const refs: readonly PortRef[] = world.Stock.$def.uses?.() ?? [];
    expect(refs.map((ref) => ref.$ref)).toEqual(["port", "port", "unresolved"]);
    const hole = refs.find((ref) => ref.$ref === "unresolved");
    expect<unknown>(hole).toEqual({ $ref: "unresolved", kind: "call", description: world.notifyCustomer.description });
    expect(hole).not.toHaveProperty("node");
  });
});
