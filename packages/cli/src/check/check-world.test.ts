import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runInit } from "../init/scaffold.ts";
import { runCheck } from "./check-world.ts";
import * as codeCheck from "./code-check.ts";
import * as specCheck from "./spec-check/apply-rules.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A world fresh from init, plus these files by path in the project directory. */
async function world(files: Record<string, string> = {}): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "nuhokai-check-test-"));
  roots.push(root);
  expect(await runInit(root, { out: () => {} })).toBe(0);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/** Run check: its exit code and its stdout and stderr lines, the project directory written as <root>. */
async function check(root: string): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCheck(root, { out: (line) => out.push(line), err: (line) => err.push(line) });
  const strip = (line: string) => line.replaceAll(root, "<root>");
  return { code, out: out.map(strip), err: err.map(strip) };
}

const ORPHAN = `import { node } from "@nuhokai/world";

export const Orphan = node({ id: "orphan", purpose: "p", status: "planned", source: [] }).edges({});
`;

test("Check R1: after init, check prints nothing and exits 0", async () => {
  expect(await check(await world())).toEqual({ code: 0, out: [], err: [] });
});

test("Check R1: two violations in different files are two stdout lines, exit 1", async () => {
  const root = await world({
    "nuhokai/a.ts": `import { node } from "@nuhokai/world";

export const A = node({ id: "a", purpose: "p", status: "built", source: [] }).edges({});
`,
    "nuhokai/b.ts": `import { node } from "@nuhokai/world";

export const B = node({ id: "b", purpose: "p", status: "planned", source: ["src/gone.ts"] }).edges({});
`,
  });
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { A } from "./a.ts";
import { B } from "./b.ts";

export default defineWorld({ id: "w", name: "W", source: [], children: [A, B] });
`,
  );
  rmSync(join(root, "nuhokai/example.ts"));
  expect(await check(root)).toEqual({
    code: 1,
    out: [
      'error: <root>/nuhokai/a.ts:3: A: a built node lists no source; list its code in source, e.g. ["src/orders/**"], or set its status to "planned"',
      'error: <root>/nuhokai/b.ts:3: B: source entry "src/gone.ts" matches no file; fix the path or glob, or drop the entry',
    ],
    err: [],
  });
});

test("Check R1: no world is one 'nuhokai check: ' stderr line, exit 1", async () => {
  const root = mkdtempSync(join(tmpdir(), "nuhokai-check-test-"));
  roots.push(root);
  expect(await check(root)).toEqual({
    code: 1,
    out: [],
    err: ["nuhokai check: no nuhokai/ in <root>; run `nuhokai init --path <root>` to start a world there"],
  });
});

test("CheckWorld R1: a syntax error in a node file is its tsc error line, then one stderr line, exit 1; SpecCheck never runs", async () => {
  const root = await world({ "nuhokai/broken.ts": "export const Broken = {;\n" });
  const spec = spyOn(specCheck, "applyRules");
  try {
    const result = await check(root);
    expect(result.code).toBe(1);
    expect(result.out).toEqual(["error: <root>/nuhokai/broken.ts:1: Property assignment expected."]);
    expect(result.err).toHaveLength(1);
    expect(result.err[0]).toStartWith("nuhokai check: <root>/nuhokai/broken.ts");
    expect(spec).not.toHaveBeenCalled();
  } finally {
    spec.mockRestore();
  }
});

test("CheckWorld R2: a tsc error with a clean spec never runs CodeCheck; an orphan warning alone does, exit 0", async () => {
  const code = spyOn(codeCheck, "runCodeCheck");
  try {
    const typeError = await world({ "nuhokai/index.test.ts": 'export const x: number = "one";\n' });
    expect(await check(typeError)).toEqual({
      code: 1,
      out: ["error: <root>/nuhokai/index.test.ts:1: Type 'string' is not assignable to type 'number'."],
      err: [],
    });
    expect(code).not.toHaveBeenCalled();

    const orphan = await world({ "nuhokai/orphan.ts": ORPHAN });
    expect(await check(orphan)).toEqual({
      code: 0,
      out: [
        "warning: <root>/nuhokai/orphan.ts: Orphan: Orphan is exported but not reachable from the world; list it in a dome's children or in the world's (<root>/nuhokai/index.ts), or delete it",
      ],
      err: [],
    });
    expect(code).toHaveBeenCalledTimes(1);
  } finally {
    code.mockRestore();
  }
});

test("CheckWorld R3: a tsc finding names its node when its file defines exactly one", async () => {
  const root = await world();
  writeFileSync(
    join(root, "nuhokai/example.ts"),
    `import { node } from "@nuhokai/world";

export const Example = node({ id: "e", purpose: "p", source: [], status: "done" }).edges({});
`,
  );
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { Example } from "./example.ts";

export default defineWorld({ id: "w", name: "W", source: [], children: [Example] });
export const wrong: number = "one";
`,
  );
  const result = await check(root);
  expect(result.code).toBe(1);
  expect(result.out).toEqual([
    "error: <root>/nuhokai/example.ts:3: Example: Type '\"done\"' is not assignable to type 'NodeStatus'.",
    "error: <root>/nuhokai/index.ts:5: Type 'string' is not assignable to type 'number'.",
  ]);
});

test("CheckWorld R3: no node is named for a file that defines two nodes", async () => {
  const root = await world();
  writeFileSync(
    join(root, "nuhokai/example.ts"),
    `import { node } from "@nuhokai/world";

export const Example = node({ id: "e", purpose: "p", source: [], status: "done" }).edges({});
export const Other = node({ id: "o", purpose: "p", source: [], status: "planned" }).edges({});
`,
  );
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { Example, Other } from "./example.ts";

export default defineWorld({ id: "w", name: "W", source: [], children: [Example, Other] });
`,
  );
  expect(await check(root)).toEqual({
    code: 1,
    out: ["error: <root>/nuhokai/example.ts:3: Type '\"done\"' is not assignable to type 'NodeStatus'."],
    err: [],
  });
});

test("a missing nuhokai/tsconfig.json is a failure saying how to restore it; the spec findings still print", async () => {
  const root = await world({ "nuhokai/orphan.ts": ORPHAN });
  rmSync(join(root, "nuhokai/tsconfig.json"));
  const result = await check(root);
  expect(result.code).toBe(1);
  expect(result.out).toHaveLength(1);
  expect(result.err).toEqual([
    "nuhokai check: <root>/nuhokai/tsconfig.json: not found; it is CLI-owned: copy it from a fresh `nuhokai init` (`nuhokai update` will restore it)",
  ]);
});
