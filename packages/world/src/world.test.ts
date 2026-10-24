import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineNode, defineWorld, inherited, relation, tbd } from "./index.ts";

const Billing = defineNode({
  id: "01a16dd2-bc51-72f0-9842-c9e091eddd30",
  purpose: "Charges orders.",
  status: "planned",
  source: [],
  ports: {
    charge: { kind: "call", purpose: "Charge an order", errors: ["declined"] },
    charged: { kind: "event", purpose: "An order was charged" },
  },
}).edges({});

describe("defineNode", () => {
  test("returns a draft that is not a node until .edges()", () => {
    const draft = defineNode({
      id: "01a16dd2-bc51-72f0-9842-c9e091eddd30",
      purpose: "",
      status: "planned",
      source: [],
    });
    expect(draft.$ref).toBe("draft");
    expect(draft).not.toHaveProperty("$def");
    expect(draft.edges({}).$ref).toBe("node");
  });

  test("returns a node reference carrying the definition", () => {
    expect(Billing.$ref).toBe("node");
    expect(Billing.$def.id).toBe("01a16dd2-bc51-72f0-9842-c9e091eddd30");
  });

  test("exposes one port reference per own port, bound to the handle", () => {
    expect<unknown>(Billing.charge).toEqual({ $ref: "port", kind: "call", node: Billing, name: "charge" });
    expect(Billing.charged).toMatchObject({ $ref: "port", kind: "event", name: "charged" });
    expect(Object.keys(Billing).sort()).toEqual(["$def", "$ref", "charge", "charged"]);
  });

  test("handles, port references and the whole definition are frozen", () => {
    expect(Object.isFrozen(Billing)).toBe(true);
    expect(Object.isFrozen(Billing.charge)).toBe(true);
    const def = Billing.$def;
    const charge = def.ports?.charge;
    const errors = charge?.kind === "call" ? charge.errors : undefined;
    for (const part of [def, def.source, def.ports, charge, errors]) {
      expect(Object.isFrozen(part)).toBe(true);
    }
  });

  test("copies the definition instead of freezing the caller's objects", () => {
    const source = ["src/a/**"];
    const node = defineNode({ id: "01a16dd2-bc51-72f0-9842-c9e091eddd30", purpose: "", status: "planned", source });
    expect(node.edges({}).$def.source).toEqual(source);
    expect(Object.isFrozen(source)).toBe(false);
  });

  test("merges both steps into $def and does not call lazy edges", () => {
    let calls = 0;
    const uses = () => {
      calls++;
      return [];
    };
    const node = defineNode({
      id: "01a16dd2-bc5a-71ca-97ca-ba8bec3591b7",
      purpose: "Lazy.",
      status: "planned",
      source: [],
      ports: { charge: { kind: "call", purpose: "Charge" } },
      delegate: { charge: () => Billing.charge },
    }).edges({ uses });
    expect(calls).toBe(0);
    expect(node.$def.uses).toBe(uses);
    expect(node.$def.delegate?.charge?.()).toBe(Billing.charge);
  });

  test("port names that clash with Object.prototype are plain properties", () => {
    // `__proto__` is rejected by the types (a literal `__proto__:` key sets the prototype instead);
    // a computed key still has to be safe at runtime.
    const ports = {
      ["__proto__"]: { kind: "call", purpose: "Proto" },
      toString: { kind: "call", purpose: "String" },
      constructor: { kind: "event", purpose: "Constructed" },
    } as const;
    const node = defineNode({
      id: "01a16dd2-bc5a-71ca-97ca-ba8bec3591b7",
      purpose: "Clashing names.",
      status: "planned",
      source: [],
      ports: ports as never,
    }).edges({}) as unknown as Record<string, { name: string }>;
    expect(Object.keys(node).sort()).toEqual(["$def", "$ref", "__proto__", "constructor", "toString"]);
    expect(Object.getPrototypeOf(node)).toBe(Object.prototype);
    for (const name of ["__proto__", "toString", "constructor"]) {
      expect(Object.hasOwn(node, name)).toBe(true);
      expect(node[name]?.name).toBe(name);
    }
  });
});

describe("inherited", () => {
  test("references an implementor's port inherited from a contract", () => {
    const Audit = defineNode({
      id: "01a16dd2-bc60-7c4e-8e7b-4d1f2b3c5a6e",
      abstract: true,
      purpose: "Contract.",
      status: "planned",
      source: [],
      ports: { history: { kind: "call", purpose: "History" } },
    }).edges({});
    const Ledger = defineNode({
      id: "01a16dd2-bc61-7a1b-9c2d-3e4f5a6b7c8d",
      purpose: "Implementor.",
      status: "planned",
      source: [],
      implements: () => [Audit],
    }).edges({});
    const ref = inherited(Ledger, Audit.history);
    expect<unknown>(ref).toEqual({ $ref: "inherited", kind: "call", node: Ledger, port: Audit.history });
    expect(Object.isFrozen(ref)).toBe(true);
  });
});

describe("defineWorld and relation", () => {
  const Shop = defineNode({
    id: "01a16dd2-bc62-7d3e-8f4a-5b6c7d8e9f01",
    purpose: "Parent.",
    status: "planned",
    source: [],
    ports: { pay: { kind: "call", purpose: "Pay" } },
    delegate: { pay: () => Billing.charge },
  }).edges({});
  const Db = defineNode({
    id: "01a16dd2-bc63-7e4f-9a5b-6c7d8e9f0a12",
    external: true,
    purpose: "External.",
    status: "built",
    source: [],
  }).edges({});

  test("build frozen, branded trees that keep the references by identity", () => {
    const children = [Billing];
    const shop = relation({ parent: Shop, children });
    const world = defineWorld({ children: [Db, shop] });
    expect<unknown>(shop).toEqual({ $ref: "relation", parent: Shop, children: [Billing] });
    expect(shop.parent).toBe(Shop);
    expect(shop.children[0]).toBe(Billing);
    expect(world.$ref).toBe("world");
    expect(world.children).toEqual([Db, shop]);
    expect(world.children[1]).toBe(shop);
    for (const part of [shop, shop.children, world, world.children]) expect(Object.isFrozen(part)).toBe(true);
  });

  test("copy the children instead of freezing the caller's array", () => {
    const children = [Billing];
    relation({ parent: Shop, children });
    expect(Object.isFrozen(children)).toBe(false);
  });
});

describe("tbd", () => {
  test("creates distinct, frozen, unresolved placeholders of the given kind", () => {
    const a = tbd.call({ description: "Fraud check" });
    const b = tbd.event({ description: "Fraud detected" });
    expect<unknown>(a).toEqual({ $ref: "unresolved", kind: "call", description: "Fraud check" });
    expect(b.kind).toBe("event");
    expect(a).not.toBe(tbd.call({ description: "Fraud check" }));
    expect(Object.isFrozen(a)).toBe(true);
  });
});

describe("package", () => {
  // The CLI will provide this package as a virtual module in repos without
  // node_modules, so the runtime code must not import anything.
  test("has no runtime imports and no runtime dependencies", () => {
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    const dir = import.meta.dir;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const imports = transpiler.scanImports(readFileSync(join(dir, file), "utf8"));
      expect(
        imports.filter((i) => !i.path.startsWith("./")),
        file,
      ).toEqual([]);
    }
    const pkg = JSON.parse(readFileSync(join(dir, "../package.json"), "utf8"));
    expect(pkg.dependencies).toBeUndefined();
  });
});
