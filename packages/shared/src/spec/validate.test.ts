import { describe, expect, test } from "bun:test";
import { parseNodeSpecJson, readNodeSpec, writeNodeSpecJson } from "./index.ts";

describe("readNodeSpec", () => {
  test("accepts a valid spec", () => {
    const result = readNodeSpec({ id: "server", name: "Server" });
    expect(result.ok).toBe(true);
  });

  test("rejects unknown keys", () => {
    const result = readNodeSpec({ id: "server", name: "Server", colour: "red" });
    expect(result.ok).toBe(false);
  });

  test("rejects missing and mistyped keys", () => {
    expect(readNodeSpec({ id: "server" }).ok).toBe(false);
    expect(readNodeSpec({ id: 1, name: "Server" }).ok).toBe(false);
  });
});

describe("JSON round trip", () => {
  test("write then parse yields the same spec", () => {
    const spec = { id: "web", name: "Web client", description: "R3F archipelago" };
    const result = parseNodeSpecJson(writeNodeSpecJson(spec));
    expect(result).toEqual({ ok: true, value: spec });
  });

  test("reports invalid JSON", () => {
    expect(parseNodeSpecJson("{").ok).toBe(false);
  });
});
