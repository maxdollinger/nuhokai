import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runInit } from "../init/scaffold.ts";
import { CliError } from "../shared/failure.ts";
import { formatFinding } from "./diagnostics.ts";
import { runTypeCheck } from "./type-check.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A world fresh from init, plus these files by path in the project directory. */
async function world(files: Record<string, string> = {}): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "nuhokai-type-check-test-"));
  roots.push(root);
  expect(await runInit(root, { out: () => {} })).toBe(0);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

async function typeCheck(root: string): Promise<string[]> {
  return (await runTypeCheck(root)).map((finding) => formatFinding(finding).replaceAll(`${root}/`, ""));
}

test("a world fresh from init type-checks clean", async () => {
  expect(await typeCheck(await world())).toEqual([]);
});

test("R1: a type error in nuhokai/index.test.ts is one error; the same in nuhokai/.generated/x.ts none", async () => {
  const root = await world({
    "nuhokai/index.test.ts": 'export const x: number = "one";\n',
    "nuhokai/.generated/x.ts": 'export const x: number = "one";\n',
  });
  expect(await typeCheck(root)).toEqual([
    "error: nuhokai/index.test.ts:1: Type 'string' is not assignable to type 'number'.",
  ]);
});

test("R2: a cast to any, a @ts-expect-error line and Reflect.get(...) are three errors", async () => {
  const root = await world({
    "nuhokai/dome.ts": `import { node } from "@nuhokai/world";
import { Example } from "./example.ts";

export const Contract = node({ id: "c", purpose: "p", status: "planned", source: [], abstract: true }).edges({});
export const Dome = node({
  id: "dome",
  purpose: "p",
  status: "planned",
  source: [],
  children: { a: Contract as any, b: Example },
  ports: () => ({}),
}).edges({});
// @ts-expect-error
export const wrong: number = "not a number";
export const read = Reflect.get(Dome, "$def");
`,
  });
  expect(await typeCheck(root)).toEqual([
    "error: nuhokai/dome.ts:10: world files use no cast; it bypasses the rules tsc checks; drop the cast and fix the type error",
    "error: nuhokai/dome.ts:13: world files use no @ts-expect-error directive; it hides what tsc reports; drop the directive and fix the error",
    "error: nuhokai/dome.ts:15: world files are declarative: they call only node, .edges, defineWorld, tbd.call, tbd.event and inherited, not Reflect.get(...); write the value out as data",
  ]);
});

test("R2: as const is no cast", async () => {
  const root = await world({
    "nuhokai/a.ts": `import { node } from "@nuhokai/world";
export const ports = { run: { kind: "call", purpose: "Run" } } as const;
export const A = node({ id: "a", purpose: "p", status: "planned", source: [], ports }).edges({});
`,
  });
  expect(await typeCheck(root)).toEqual([]);
});

test("R2: a test file importing bun:test fails too", async () => {
  const root = await world({ "nuhokai/index.test.ts": 'import { test } from "bun:test";\n\ntest("x", () => {});\n' });
  const findings = await typeCheck(root);
  expect(findings).toContain(
    'error: nuhokai/index.test.ts:1: world files import only @nuhokai/world and files under nuhokai/, not "bun:test"; move what the import provides into the world, or drop the import',
  );
  expect(findings.every((line) => line.startsWith("error: nuhokai/index.test.ts:"))).toBe(true);
});

test("R2: imports reach only @nuhokai/world and files under nuhokai/; no non-null assertion or any", async () => {
  const root = await world({
    "src/outside.ts": "export const x = 1;\n",
    "nuhokai/a.ts": `import { x } from "../src/outside.ts";
import { Example } from "./example.ts";
export const y: any = x;
export const z = [Example][0]!;
export { later } from "./example.ts";
`,
  });
  expect(await typeCheck(root)).toEqual([
    'error: nuhokai/a.ts:1: world files import only @nuhokai/world and files under nuhokai/, not "../src/outside.ts"; move what the import provides into the world, or drop the import',
    "error: nuhokai/a.ts:3: world files use no any; it bypasses the rules tsc checks; name the real type",
    "error: nuhokai/a.ts:4: world files use no non-null assertion; drop the ! and handle the missing value",
  ]);
});

test("R3: without nuhokai/tsconfig.json, one failure naming init and no findings", async () => {
  const root = await world();
  rmSync(join(root, "nuhokai/tsconfig.json"));
  const failure = runTypeCheck(root);
  await expect(failure).rejects.toBeInstanceOf(CliError);
  await expect(failure).rejects.toThrow(`${root}/nuhokai/tsconfig.json: not found; it is CLI-owned`);
});
