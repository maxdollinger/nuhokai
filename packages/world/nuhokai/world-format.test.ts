import { expect, test } from "bun:test";
import world from "./index.ts";
import { WorldFormat } from "./world-format.ts";

test("the package describes itself as a node in the world format", () => {
  expect(WorldFormat.$ref).toBe("node");
  expect(WorldFormat.$def.id).toBeTruthy();
  expect(WorldFormat.node).toMatchObject({ $ref: "port", kind: "call", name: "node" });
  expect(WorldFormat.node.node).toBe(WorldFormat);
});

test("records the id, hierarchy and world-file decisions in the node spec's Decision shape", () => {
  // The Decision shape itself is enforced by the compile-time sync with the node spec in src/types.ts.
  const decisions = WorldFormat.$def.decisions ?? [];
  const find = (text: string) => decisions.findIndex((d) => d.decision.includes(text));
  const indices = [
    find("uuidv7"),
    find("The child declares its parent"),
    find("Overrides 'the child declares its parent'"),
    find("Overrides 'Overrides the child declares its parent'"),
    find("Overrides 'A node's id is an authored uuidv7'"),
  ];
  for (const index of indices) {
    expect(decisions[index]?.why).toBeTruthy();
    expect(decisions[index]?.rejected?.length).toBeGreaterThan(0);
  }
  // Append-only: each override comes after the decision it overrides.
  expect(indices[2]).toBeGreaterThan(indices[1] ?? Infinity);
  expect(indices[3]).toBeGreaterThan(indices[2] ?? Infinity);
  expect(indices[4]).toBeGreaterThan(indices[0] ?? Infinity);
  expect(decisions[indices[3] ?? -1]?.rejected?.map((r) => r.option).join()).toContain("Children as an array");
});

test("the package's own world lists WorldFormat at the top level", () => {
  expect(world.$ref).toBe("world");
  expect(world.children).toEqual([WorldFormat]);
});
