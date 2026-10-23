import { describe, expect, test } from "bun:test";
import { type NodeSpec, parseNodeSpecJson, readNodeSpec, writeNodeSpecJson } from "./index.ts";

const minimal: NodeSpec = {
  schema: "nuhokai/node@1",
  id: "server",
  name: "Server",
  parent: null,
  external: false,
  abstract: false,
  purpose: "Owns the world state.",
  status: "planned",
  source: [],
};

const full: NodeSpec = {
  ...minimal,
  id: "billing",
  parent: "server",
  status: "building",
  source: ["src/billing/**"],
  group: "money",
  ports: [
    {
      kind: "call",
      name: "charge",
      purpose: "Charge an order",
      input: "order id",
      output: "receipt",
      errors: ["declined"],
    },
    { kind: "event", name: "charged", purpose: "An order was charged", transport: "kafka", payload: "order id" },
    { kind: "call", name: "refund", purpose: "Refund an order", delegate: { to: "refunds", port: "refund" } },
  ],
  edges: [
    { kind: "uses", to: "payments-api", port: ["authorize", "capture"] },
    { kind: "implements", to: "ledger-writer" },
  ],
  requirements: [
    { id: "R1", text: "Charges each order at most once." },
    { id: "C1", kind: "constraint", text: "No card data is stored." },
  ],
  testCases: [{ text: "Charging the same order twice returns the first receipt.", demonstrates: ["R1"] }],
  decisions: [
    {
      decision: "Charge synchronously.",
      why: "Checkout needs the result.",
      rejected: [{ option: "Async charge", why: "Checkout would have to poll." }],
    },
  ],
};

describe("readNodeSpec", () => {
  test("accepts a minimal and a full node", () => {
    expect(readNodeSpec(minimal).ok).toBe(true);
    expect(readNodeSpec(full).ok).toBe(true);
    expect(readNodeSpec({ ...minimal, external: true, externalType: "db" }).ok).toBe(true);
  });

  test("rejects unknown keys, also nested ones", () => {
    expect(readNodeSpec({ ...minimal, colour: "red" }).ok).toBe(false);
    expect(readNodeSpec({ ...minimal, ports: [{ kind: "call", name: "a", purpose: "", method: "GET" }] }).ok).toBe(
      false,
    );
    expect(readNodeSpec({ ...minimal, edges: [{ kind: "implements", to: "x", port: ["a"] }] }).ok).toBe(false);
    expect(readNodeSpec({ ...minimal, ports: [{ kind: "event", name: "a", purpose: "", input: "x" }] }).ok).toBe(false);
  });

  test("rejects missing and mistyped keys", () => {
    const { status: _, ...noStatus } = minimal;
    expect(readNodeSpec(noStatus).ok).toBe(false);
    expect(readNodeSpec({ ...minimal, parent: undefined }).ok).toBe(false);
    expect(readNodeSpec({ ...minimal, external: "no" }).ok).toBe(false);
    expect(readNodeSpec({ ...minimal, status: "done" }).ok).toBe(false);
    expect(readNodeSpec({ ...minimal, externalType: "queue" }).ok).toBe(false);
    expect(readNodeSpec({ ...minimal, requirements: [{ id: "R1", kind: "requirement", text: "" }] }).ok).toBe(false);
  });

  test("rejects other schema versions", () => {
    expect(readNodeSpec({ ...minimal, schema: "nuhokai/node@2" }).ok).toBe(false);
  });

  test("ids are lowercase slugs", () => {
    for (const id of ["Server", "my_node", "-a", "a-", "a--b", ""]) {
      expect(readNodeSpec({ ...minimal, id }).ok).toBe(false);
    }
    expect(readNodeSpec({ ...minimal, id: "a1-b2" }).ok).toBe(true);
    expect(readNodeSpec({ ...minimal, parent: "Not A Slug" }).ok).toBe(false);
  });

  test("rejects unknown edge kinds and empty or duplicate uses ports", () => {
    expect(readNodeSpec({ ...minimal, edges: [{ kind: "extends", to: "x" }] }).ok).toBe(false);
    expect(readNodeSpec({ ...minimal, edges: [{ kind: "uses", to: "x", port: [] }] }).ok).toBe(false);
    expect(readNodeSpec({ ...minimal, edges: [{ kind: "uses", to: "x", port: ["a", "a"] }] }).ok).toBe(false);
  });
});

describe("JSON round trip", () => {
  test("write then parse yields the same spec", () => {
    expect(parseNodeSpecJson(writeNodeSpecJson(minimal))).toEqual({ ok: true, value: minimal });
    expect(parseNodeSpecJson(writeNodeSpecJson(full))).toEqual({ ok: true, value: full });
  });

  test("reports invalid JSON", () => {
    expect(parseNodeSpecJson("{").ok).toBe(false);
  });
});
