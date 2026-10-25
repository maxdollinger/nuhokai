import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NodeRef, PortRef, WorldChild } from "../src/index.ts";
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
  const { uses, implements: impl, delegate = {} } = node.$def;
  return [
    ...(uses?.() ?? []).map((ref, i): [string, unknown] => [`uses[${i}]`, ref]),
    ...(impl?.() ?? []).map((ref, i): [string, unknown] => [`implements[${i}]`, ref]),
    ...Object.entries(delegate).map(([port, ref]): [string, unknown] => [`delegate.${port}`, ref()]),
  ];
}

/** Every node in the world tree with its parent (`null` at the top level), depth first. */
function walk(
  children: readonly WorldChild[],
  parent: NodeRef | null = null,
): { node: NodeRef; parent: NodeRef | null }[] {
  return children.flatMap((child) =>
    child.$ref === "relation"
      ? [{ node: child.parent, parent }, ...walk(child.children, child.parent)]
      : [{ node: child, parent }],
  );
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

  test("every delegate target is a direct child of the delegating node", () => {
    for (const { name, node } of nodes) {
      for (const [port, target] of Object.entries(node.$def.delegate ?? {})) {
        const ref = target();
        if (ref.$ref !== "unresolved") expect(parentOf(ref.node), `${name}.${port}`).toBe(node);
      }
    }
    expect(world.Shop.$def.delegate?.placeOrder?.()).toBe(world.Orders.place);
  });

  test("node files never import the world file", () => {
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    for (const file of files) {
      const imports = transpiler.scanImports(readFileSync(join(import.meta.dir, file), "utf8")).map((i) => i.path);
      expect(imports, file).not.toContain("./index.ts");
    }
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
