import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("R2: a @ts- directive after a template with a substitution is found; one inside a template is no comment", async () => {
  const root = await world({
    "nuhokai/a.ts": `const a = 1;
export const t = \`\${a}\`; // @ts-ignore
export const u = \`\${a} // @ts-nocheck\`;
export const v = \`x\${a}y\${\`\${a}\`}z\`; /* @ts-expect-error */
export const w = /\\/\\/ @ts-ignore/;
`,
  });
  expect(await typeCheck(root)).toEqual([
    "error: nuhokai/a.ts:2: world files use no @ts-ignore directive; it hides what tsc reports; drop the directive and fix the error",
    "error: nuhokai/a.ts:4: Unused '@ts-expect-error' directive.",
    "error: nuhokai/a.ts:4: world files use no @ts-expect-error directive; it hides what tsc reports; drop the directive and fix the error",
  ]);
});

test("R2: a call counts only through its import from @nuhokai/world, .edges only on such a node(...) call", async () => {
  const root = await world({
    "nuhokai/a.ts": `const node = globalThis.eval;
node("x");
({ edges: eval }).edges("x");
`,
    "nuhokai/b.ts": `import { node, tbd } from "@nuhokai/world";
export const B = node({ id: "b", purpose: "p", status: "planned", source: [] }).edges({});
export const hole = tbd.call("later");
// tbd is shadowed below, so neither tbd.call is the world's.
export const f = (tbd: { call(text: string): void }) => tbd.call("x");
`,
  });
  const lines = (await typeCheck(root)).filter((line) => line.includes("declarative"));
  const call = (file: string, line: number, callee: string) =>
    `error: nuhokai/${file}:${line}: world files are declarative: they call only node, .edges, defineWorld, tbd.call, tbd.event and inherited, not ${callee}(...); write the value out as data`;
  expect(lines).toEqual([
    call("a.ts", 2, "node"),
    call("a.ts", 3, "({ edges: eval }).edges"),
    call("b.ts", 3, "tbd.call"),
    call("b.ts", 5, "tbd.call"),
  ]);
});

test("R3: an unknown compiler option or broken JSON in nuhokai/tsconfig.json is an error at its line", async () => {
  const root = await world();
  const tsconfig = join(root, "nuhokai/tsconfig.json");
  const original = readFileSync(tsconfig, "utf8");
  writeFileSync(tsconfig, original.replace('"compilerOptions": {', '"compilerOptions": {\n    "bogusOption": 1,'));
  expect(await typeCheck(root)).toEqual(["error: nuhokai/tsconfig.json:3: Unknown compiler option 'bogusOption'."]);
  writeFileSync(tsconfig, original.replace("{", "{ ,"));
  const broken = await typeCheck(root);
  expect(broken.length).toBeGreaterThan(0);
  expect(broken.every((line) => line.startsWith("error: nuhokai/tsconfig.json:1: "))).toBe(true);
});

test("a checker that fails to start is one CliError", async () => {
  const root = await world();
  const missing = runTypeCheck(root, () => join(root, "no-such-tsgo"));
  await expect(missing).rejects.toBeInstanceOf(CliError);
  await expect(missing).rejects.toThrow("the type checker failed: ");
  const notExecutable = runTypeCheck(root, () => join(root, "nuhokai/index.ts"));
  await expect(notExecutable).rejects.toBeInstanceOf(CliError);
  await expect(notExecutable).rejects.toThrow("the type checker failed: ");
});
