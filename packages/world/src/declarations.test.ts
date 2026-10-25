import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// What the CLI will ship is a `.d.ts` of this package. This proves that
// declarations emit from `src`, that they are self-contained (no non-relative
// imports), and that a world type-checked against them alone still
// gets the brand, flag, id, relation and cycle behaviour (declaration emit erases the types
// of `#private` members, which must not weaken the brands).

const tsc = join(import.meta.dir, "../../../node_modules/.bin/tsc");
const base = join(import.meta.dir, "../tsconfig.json");

function run(project: string) {
  const result = Bun.spawnSync([tsc, "-p", project, "--pretty", "false"]);
  return { code: result.exitCode, output: `${result.stdout}${result.stderr}` };
}

const consumer = {
  "a.ts": `
import { defineNode, inherited } from "../dts/index.ts";
import { B, C, Contract } from "./b.ts";
export const A = defineNode({
  id: "01a16dd2-bc70-7000-8000-000000000001", purpose: "a", status: "planned", source: [],
  ports: { x: { kind: "call", purpose: "x" } },
  implements: () => [Contract],
}).edges({ uses: () => [B.y] });
// Delegates in step one to a node of b.ts, which imports this file: no annotation needed.
export const Parent = defineNode({
  id: "01a16dd2-bc70-7000-8000-00000000000a", purpose: "p", status: "planned", source: [],
  ports: { z: { kind: "call", purpose: "z" } },
  delegate: { z: () => C.z },
}).edges({});
// @ts-expect-error typo
export const T = defineNode({ id: "01a16dd2-bc70-7000-8000-000000000002", purpose: "t", status: "planned", source: [] }).edges({ uses: () => [B.yy] });
// @ts-expect-error spread drops the brand
export const F = defineNode({ id: "01a16dd2-bc70-7000-8000-000000000004", purpose: "f", status: "planned", source: [] }).edges({ uses: () => [{ ...B.y, name: "z" }] });
export const I = defineNode({ id: "01a16dd2-bc70-7000-8000-000000000005", purpose: "i", status: "planned", source: [] }).edges({ uses: () => [inherited(A, Contract.c)] });
// @ts-expect-error B does not implement Contract
export const J = defineNode({ id: "01a16dd2-bc70-7000-8000-000000000006", purpose: "j", status: "planned", source: [] }).edges({ uses: () => [inherited(B, Contract.c)] });
`,
  "b.ts": `
import { defineNode } from "../dts/index.ts";
import { A } from "./a.ts";
export const Contract = defineNode({ id: "01a16dd2-bc70-7000-8000-000000000007", abstract: true, purpose: "c", status: "planned", source: [], ports: { c: { kind: "call", purpose: "c" } } }).edges({});
export const Ext = defineNode({ id: "01a16dd2-bc70-7000-8000-000000000008", external: true, purpose: "e", status: "planned", source: [] }).edges({});
export const B = defineNode({ id: "01a16dd2-bc70-7000-8000-000000000009", purpose: "b", status: "planned", source: [], ports: { y: { kind: "call", purpose: "y" } } }).edges({ uses: () => [A.x] });
export const C = defineNode({ id: "01a16dd2-bc70-7000-8000-00000000000b", purpose: "c", status: "planned", source: [], ports: { z: { kind: "call", purpose: "z" } } }).edges({});
`,
  "index.ts": `
import { defineWorld, relation } from "../dts/index.ts";
import { A, Parent } from "./a.ts";
import { B, C, Contract, Ext } from "./b.ts";
export default defineWorld({ children: [A, B, Contract, Ext, relation({ parent: Parent, children: [C] })] });
// @ts-expect-error external parent
export const P = relation({ parent: Ext, children: [C] });
// @ts-expect-error external child
export const Q = relation({ parent: Parent, children: [C, Ext] });
// @ts-expect-error C, the delegate target, is not a child
export const R = relation({ parent: Parent, children: [B] });
// @ts-expect-error a string is not a node
export const S = defineWorld({ children: ["a"] });
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
