import { expect, test } from "bun:test";
import world from "./index.ts";
import { WorldFormat } from "./world-format.ts";

test("the package describes itself as a node in the world format", () => {
  expect(WorldFormat.$ref).toBe("node");
  expect(WorldFormat.$def.id).toBeTruthy();
  expect(WorldFormat.defineNode).toMatchObject({ $ref: "port", kind: "call", name: "defineNode" });
  expect(WorldFormat.defineNode.node).toBe(WorldFormat);
});

test("records the id, parent-ref and world-file decisions in the MAX-5 Decision shape", () => {
  // The Decision shape itself is enforced by the compile-time sync with MAX-5 in src/types.ts.
  const decisions = WorldFormat.$def.decisions ?? [];
  const find = (text: string) => decisions.findIndex((d) => d.decision.includes(text));
  const indices = [
    find("uuidv7"),
    find("The child declares its parent"),
    find("Overrides 'the child declares its parent'"),
    find("Overrides 'A node's id is an authored uuidv7'"),
  ];
  for (const index of indices) {
    expect(decisions[index]?.why).toBeTruthy();
    expect(decisions[index]?.rejected?.length).toBeGreaterThan(0);
  }
  // Append-only: the override comes after the decision it overrides, and rejects the tuple form.
  expect(indices[2]).toBeGreaterThan(indices[1] ?? Infinity);
  expect(decisions[indices[2] ?? -1]?.rejected?.map((r) => r.option).join()).toContain("Tuples");
  expect(indices[3]).toBeGreaterThan(indices[0] ?? Infinity);
});

test("the package's own world lists WorldFormat at the top level", () => {
  expect(world.$ref).toBe("world");
  expect(world.children).toEqual([WorldFormat]);
});
