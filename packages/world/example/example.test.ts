import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { NodeRef, PortRef } from "../src/index.ts";
import * as world from "./index.ts";

// Every world file (type-errors.ts is compile-time only and never evaluated), by file name.
const files = readdirSync(import.meta.dir).filter(
  (file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "index.ts" && file !== "type-errors.ts",
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
  const { parent, uses, implements: impl, delegate = {} } = node.$def;
  return [
    ...(parent ? [["parent", parent()] as [string, unknown]] : []),
    ...(uses?.() ?? []).map((ref, i): [string, unknown] => [`uses[${i}]`, ref]),
    ...(impl?.() ?? []).map((ref, i): [string, unknown] => [`implements[${i}]`, ref]),
    ...Object.entries(delegate).map(([port, ref]): [string, unknown] => [`delegate.${port}`, ref()]),
  ];
}

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

  test("a parent delegates a port to its child, and the child names the parent", () => {
    expect(world.Shop.$def.delegate?.placeOrder?.()).toBe(world.Orders.place);
    expect(world.Orders.$def.parent?.()).toBe(world.Shop);
  });

  test("a parent delegates to a port its child inherited", () => {
    expect<unknown>(world.Shop.$def.delegate?.orderHistory?.()).toEqual({
      $ref: "inherited",
      kind: "call",
      node: world.Orders,
      port: world.AuditLog.history,
    });
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
