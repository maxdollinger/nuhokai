import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORLD_TYPES } from "../src/toolchain/world-types.gen.ts";
import { GENERATED_FILE, renderGeneratedModule, renderWorldTypes, TSC } from "./embed-world.ts";

const dependency = `
import { node } from "./dts/index.ts";

export const Contract = node({
  id: "01a16dd2-bc70-7000-8000-000000000010",
  abstract: true,
  purpose: "c",
  status: "planned",
  source: [],
  ports: { c: { kind: "call", purpose: "c" } },
}).edges({});

export const B = node({
  id: "01a16dd2-bc70-7000-8000-000000000011",
  purpose: "b",
  status: "planned",
  source: [],
  ports: { y: { kind: "call", purpose: "y" } },
}).edges({});
`;

const consumer = `
import { defineWorld, inherited, node, tbd, type NodeId } from "./dts/index.ts";
import { B, Contract } from "./b.ts";

const id: NodeId = "01a16dd2-bc70-7000-8000-000000000001";
const hole = tbd.call({ description: "not designed yet" });

export const A = node({
  id,
  purpose: "a",
  status: "planned",
  source: [],
  ports: { x: { kind: "call", purpose: "x" } },
  implements: () => [Contract],
}).edges({ uses: () => [B.y, hole] });

export const I = node({
  id: "01a16dd2-bc70-7000-8000-000000000002",
  purpose: "i",
  status: "planned",
  source: [],
}).edges({ uses: () => [inherited(A, Contract.c)] });

// @ts-expect-error typo
export const T = node({ id: "01a16dd2-bc70-7000-8000-000000000003", purpose: "t", status: "planned", source: [] }).edges({ uses: () => [B.yy] });
// @ts-expect-error spread drops the brand
export const F = node({ id: "01a16dd2-bc70-7000-8000-000000000004", purpose: "f", status: "planned", source: [] }).edges({ uses: () => [{ ...B.y, name: "z" }] });

export default defineWorld({ id: "w", name: "w", source: [], children: [A, I] });
`;

function run(project: string) {
  const result = Bun.spawnSync([TSC, "-p", project, "--pretty", "false"]);
  return { code: result.exitCode, output: `${result.stdout}${result.stderr}` };
}

test("the embedded world types are up to date", () => {
  expect(readFileSync(GENERATED_FILE, "utf8")).toBe(renderGeneratedModule());
  expect(WORLD_TYPES).toBe(renderWorldTypes());
});

test("the embedded world types type-check a consumer world", () => {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-cli-world-types-"));
  try {
    mkdirSync(join(dir, "dts"));
    writeFileSync(join(dir, "dts", "index.d.ts"), WORLD_TYPES);
    writeFileSync(join(dir, "b.ts"), dependency);
    writeFileSync(join(dir, "consumer.ts"), consumer);

    const project = join(dir, "tsconfig.json");
    writeFileSync(
      project,
      JSON.stringify({
        extends: join(import.meta.dir, "../../../tsconfig.base.json"),
        compilerOptions: { types: [] },
        include: [join(dir, "consumer.ts")],
      }),
    );
    expect(run(project)).toEqual({ code: 0, output: "" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
