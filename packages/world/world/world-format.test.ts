import { expect, test } from "bun:test";
import { WorldFormat } from "./world-format.ts";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("the package describes itself as a node in the world format", () => {
  expect(WorldFormat.$ref).toBe("node");
  expect(WorldFormat.$def.id).toMatch(UUID_V7);
  expect(WorldFormat.defineNode).toMatchObject({ $ref: "port", kind: "call", name: "defineNode" });
  expect(WorldFormat.defineNode.node).toBe(WorldFormat);
});

test("records the uuidv7-id and parent-ref decisions in the MAX-5 Decision shape", () => {
  // The Decision shape itself is enforced by the compile-time sync with MAX-5 in src/types.ts.
  const decisions = WorldFormat.$def.decisions ?? [];
  const find = (text: string) => decisions.find((d) => d.decision.includes(text));
  for (const decision of [find("uuidv7"), find("declares its parent")]) {
    expect(decision?.why).toBeTruthy();
    expect(decision?.rejected?.length).toBeGreaterThan(0);
  }
});
