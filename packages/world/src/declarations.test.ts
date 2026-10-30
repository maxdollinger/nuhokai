import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// What the CLI will ship is a `.d.ts` of this package. This proves that
// declarations emit from `src`, that they are self-contained (no non-relative
// imports), and that a world type-checked against them alone still
// gets the brand, flag, id, child and cycle behaviour (declaration emit erases the types
// of `#private` members, which must not weaken the brands).

const tsc = join(import.meta.dir, "../../../node_modules/.bin/tsc");
const base = join(import.meta.dir, "../tsconfig.json");

function run(project: string) {
  const result = Bun.spawnSync([tsc, "-p", project, "--pretty", "false"]);
  return { code: result.exitCode, output: `${result.stdout}${result.stderr}` };
}

const consumer = {
  "a.ts": `
import { inherited, node } from "../dts/index.ts";
import { B, C, Contract } from "./b.ts";
export const A = node({
  id: "01a16dd2-bc70-7000-8000-000000000001", purpose: "a", status: "planned", source: [],
  ports: { x: { kind: "call", purpose: "x" } },
  implements: () => [Contract],
}).edges({ uses: () => [B.y] });
// Children are in step one and import b.ts, which imports this file: no annotation needed.
export const Parent = node({
  id: "01a16dd2-bc70-7000-8000-00000000000a", purpose: "p", status: "planned", source: [],
  children: { c: C },
  ports: (c) => ({ z: c.c.ports.z }),
}).edges({});
// @ts-expect-error typo
export const T = node({ id: "01a16dd2-bc70-7000-8000-000000000002", purpose: "t", status: "planned", source: [] }).edges({ uses: () => [B.yy] });
// @ts-expect-error spread drops the brand
export const F = node({ id: "01a16dd2-bc70-7000-8000-000000000004", purpose: "f", status: "planned", source: [] }).edges({ uses: () => [{ ...B.y, name: "z" }] });
export const I = node({ id: "01a16dd2-bc70-7000-8000-000000000005", purpose: "i", status: "planned", source: [] }).edges({ uses: () => [inherited(A, Contract.c)] });
// @ts-expect-error B does not implement Contract
export const J = node({ id: "01a16dd2-bc70-7000-8000-000000000006", purpose: "j", status: "planned", source: [] }).edges({ uses: () => [inherited(B, Contract.c)] });
`,
  "b.ts": `
import { node } from "../dts/index.ts";
import { A } from "./a.ts";
export const Contract = node({ id: "01a16dd2-bc70-7000-8000-000000000007", abstract: true, purpose: "c", status: "planned", source: [], ports: { c: { kind: "call", purpose: "c" } } }).edges({});
export const Ext = node({ id: "01a16dd2-bc70-7000-8000-000000000008", external: true, purpose: "e", status: "planned", source: [] }).edges({});
export const B = node({ id: "01a16dd2-bc70-7000-8000-000000000009", purpose: "b", status: "planned", source: [], ports: { y: { kind: "call", purpose: "y" } } }).edges({ uses: () => [A.x] });
export const C = node({ id: "01a16dd2-bc70-7000-8000-00000000000b", purpose: "c", status: "planned", source: [], ports: { z: { kind: "call", purpose: "z" } } }).edges({});
`,
  "index.ts": `
import { defineWorld, node } from "../dts/index.ts";
import { A, Parent } from "./a.ts";
import { B, C, Contract, Ext } from "./b.ts";
export default defineWorld({ id: "01a16dd2-bc70-7000-8000-00000000000e", name: "w", source: [], children: [A, B, Contract, Ext, Parent] });
// @ts-expect-error a world needs an id
export const N = defineWorld({ name: "n", source: [], children: [A] });
// @ts-expect-error external child
export const Q = node({ id: "01a16dd2-bc70-7000-8000-00000000000c", purpose: "q", status: "planned", source: [], children: { c: C, ext: Ext } }).edges({});
// @ts-expect-error C is not a direct child
export const R = node({ id: "01a16dd2-bc70-7000-8000-00000000000d", purpose: "r", status: "planned", source: [], children: { b: B }, ports: () => ({ z: C.z }) }).edges({});
// @ts-expect-error a string is not a node
export const S = defineWorld({ id: "s", name: "s", source: [], children: ["a"] });
`,
};

test("declarations emit self-contained and keep the brands", () => {
  const dir = mkdtempSync(join(tmpdir(), "world-dts-"));
  try {
    const emit = join(dir, "emit.json");
    writeFileSync(
      emit,
      JSON.stringify({
        extends: base,
        compilerOptions: {
          noEmit: false,
          declaration: true,
          emitDeclarationOnly: true,
          noEmitOnError: true,
          outDir: join(dir, "dts"),
          rootDir: import.meta.dir,
          types: [],
        },
        include: [],
        files: [join(import.meta.dir, "index.ts")],
      }),
    );
    expect(run(emit)).toEqual({ code: 0, output: "" });

    const files = readdirSync(join(dir, "dts"));
    expect(files).toContain("index.d.ts");
    const imports = files.flatMap((file) =>
      [...readFileSync(join(dir, "dts", file), "utf8").matchAll(/(?:from|import\()\s*"([^"]+)"/g)].map((m) => m[1]),
    );
    expect([...new Set(imports.filter((path) => !path?.startsWith("./")))]).toEqual([]);

    mkdirSync(join(dir, "consumer"));
    for (const [name, text] of Object.entries(consumer)) writeFileSync(join(dir, "consumer", name), text);
    const check = join(dir, "check.json");
    writeFileSync(
      check,
      JSON.stringify({
        extends: base,
        compilerOptions: { types: [] },
        include: [join(dir, "consumer")],
      }),
    );
    expect(run(check)).toEqual({ code: 0, output: "" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
