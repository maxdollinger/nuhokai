import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runInit } from "../init/scaffold.ts";
import { checkerPath, withChecker } from "../shared/checker-client.ts";
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
  expect((await runInit(root)).outcome).toBe("ok");
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
    "error: nuhokai/index.test.ts:1:14: Type 'string' is not assignable to type 'number'.",
  ]);
});

test("R2: a cast to any and a @ts-expect-error line are two errors; a call is LoadWorld's to judge, not R2's", async () => {
  const root = await world({
    "nuhokai/dome.ts": `import { node } from "@nuhokai/world";
import { Example } from "./example.ts";

export const Contract = node({ id: "c", purpose: "p", status: "planned", source: [], abstract: true }).edges({});
export const Dome = node({
  id: "dome",
  purpose: "p",
  status: "planned",
  source: [],
  children: [Contract as any, Example],
  ports: {},
}).edges({});
// @ts-expect-error
export const wrong: number = "not a number";
export const read = Reflect.get(Dome, "$def");
`,
  });
  expect(await typeCheck(root)).toEqual([
    "error: nuhokai/dome.ts:10:14: world files use no cast; it bypasses the rules tsc checks; drop the cast and fix the type error",
    "error: nuhokai/dome.ts:13:1: world files use no @ts-expect-error directive; it hides what tsc reports; drop the directive and fix the error",
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
    'error: nuhokai/index.test.ts:1:1: world files import only @nuhokai/world and files under nuhokai/, not "bun:test"; move what the import provides into the world, or drop the import',
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
    'error: nuhokai/a.ts:1:1: world files import only @nuhokai/world and files under nuhokai/, not "../src/outside.ts"; move what the import provides into the world, or drop the import',
    "error: nuhokai/a.ts:3:17: world files use no any; it bypasses the rules tsc checks; name the real type",
    "error: nuhokai/a.ts:4:18: world files use no non-null assertion; drop the ! and handle the missing value",
  ]);
});

test("R4: an error about a Forbidden<…> is its message alone; other types are cut to their names", async () => {
  const root = await world({
    "nuhokai/a.ts": `import { node } from "@nuhokai/world";
export const Draft = node({ id: "a1", purpose: "p", status: "planned", source: [], ports: {} });
export const Dome = node({ id: "a2", purpose: "p", status: "planned", source: [], children: [Draft] }).edges({});
export const Named = node({ id: "a3", purpose: "p", status: "planned", source: [], children: ["Draft"] }).edges({});
export const Typed = node({ id: "a4", purpose: "p", status: "planned", source: [], ports: {}, externalType: "api" }).edges({});
export const Odd = node({ id: "a5", purpose: "p", status: "planned", source: [], ports: {}, purpos: "x" }).edges({});
`,
  });
  expect(await typeCheck(root)).toEqual([
    "error: nuhokai/a.ts:3:94: a draft is not a node: call .edges(), also with {}",
    "error: nuhokai/a.ts:4:95: a child is a node reference, not a string: list the node's const, e.g. children: [Orders]",
    "error: nuhokai/a.ts:5:95: externalType is for external nodes only",
    "error: nuhokai/a.ts:6:93: Object literal may only specify known properties, but 'purpos' does not exist in type 'NodeShape'. Did you mean to write 'purpose'?",
  ]);
});

test("R4: a quote inside a string literal type ends no type; a long object type tsc spells out is { … }", async () => {
  const root = await world({
    "nuhokai/a.ts": `import { node } from "@nuhokai/world";
export const A = node({ id: "a", status: "planned", source: [], ports: { hi: { kind: "call", purpose: "Say the user's hello" } } }).edges({});
export const B = node({ id: "b", purpose: "the world's <best> & {last}", status: "planned", source: [], ports: {}, bogus: 1 }).edges({});
`,
  });
  expect(await typeCheck(root)).toEqual([
    "error: nuhokai/a.ts:2:23: Argument of type '{ … }' is not assignable to parameter of type 'NodeShape'. Property 'purpose' is missing in type '{ … }' but required in type 'NodeShape'.",
    "error: nuhokai/a.ts:3:116: Object literal may only specify known properties, and 'bogus' does not exist in type 'NodeShape'.",
  ]);
});

test("R4: tsc's advice to change the library or install types gives way to the world's fix", async () => {
  const root = await world({ "nuhokai/a.ts": "export const a = typeof console;\nexport const b = typeof process;\n" });
  const fix =
    "remove the code that uses it: world files hold data only (do not edit nuhokai/tsconfig.json, it is CLI-owned)";
  expect(await typeCheck(root)).toEqual([
    `error: nuhokai/a.ts:1:25: Cannot find name 'console'; ${fix}`,
    `error: nuhokai/a.ts:2:25: Cannot find name 'process'; ${fix}`,
  ]);
});

test("R5: a file that does not parse is its first syntax error alone; R2 refuses an import once, without tsc's", async () => {
  const root = await world({
    "nuhokai/a.ts": `import { node } from "@nuhokai/world";
export const A = node({ id: "a", purpose: "unterminated, status: "planned", source: [] }).edges({});
export const B = node({ id: "b", purpose: "p", status: "planned", source: [] }).edges({ uses: () => [it] });
`,
    "nuhokai/b.ts": 'import { pad } from "left-pad";\nexport const b = pad;\n',
  });
  expect(await typeCheck(root)).toEqual([
    "error: nuhokai/a.ts:2:67: ',' expected.",
    'error: nuhokai/b.ts:1:1: world files import only @nuhokai/world and files under nuhokai/, not "left-pad"; move what the import provides into the world, or drop the import',
  ]);
});

test("R4: an apostrophe in tsc's prose opens no type; a type tsc cut off keeps its names; only the reader's literal is { … }", async () => {
  const root = await world({
    "nuhokai/a.ts": `const o = { a: "it's" } as const;
export const v = o["b"];
`,
  });
  const index = join(root, "nuhokai/index.ts");
  writeFileSync(index, readFileSync(index, "utf8").replace(/ {2}name: .*\n/, ""));
  const findings = await typeCheck(root);
  expect(findings).toContain(
    "error: nuhokai/a.ts:2:18: Element implicitly has an 'any' type because expression of type '\"b\"' can't be used to index type '{ readonly a: \"it's\"; }'. Property 'b' does not exist on type '{ readonly a: \"it's\"; }'.",
  );
  const missing = findings.find((line) => line.includes("Property 'name' is missing"));
  // The reader's literal is { … }; the type it should match is tsc's, spelled out, cut to names where tsc cut it off.
  expect(missing).toContain("Property 'name' is missing in type '{ … }' but required in type '{ readonly id: string;");
  expect(missing).toContain("readonly children: readonly [NodeHandle<…>'");
});

test("R5: a multi-line import R2 refuses is R2's finding alone", async () => {
  const root = await world({ "nuhokai/a.ts": 'import {\n  pad,\n} from "left-pad";\nexport const p = pad;\n' });
  expect(await typeCheck(root)).toEqual([
    'error: nuhokai/a.ts:1:1: world files import only @nuhokai/world and files under nuhokai/, not "left-pad"; move what the import provides into the world, or drop the import',
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
    "error: nuhokai/a.ts:2:26: world files use no @ts-ignore directive; it hides what tsc reports; drop the directive and fix the error",
    "error: nuhokai/a.ts:4:38: Unused '@ts-expect-error' directive.",
    "error: nuhokai/a.ts:4:38: world files use no @ts-expect-error directive; it hides what tsc reports; drop the directive and fix the error",
  ]);
});

test("R3: an unknown compiler option or broken JSON in nuhokai/tsconfig.json is an error at its line", async () => {
  const root = await world();
  const tsconfig = join(root, "nuhokai/tsconfig.json");
  const original = readFileSync(tsconfig, "utf8");
  writeFileSync(tsconfig, original.replace('"compilerOptions": {', '"compilerOptions": {\n    "bogusOption": 1,'));
  expect(await typeCheck(root)).toEqual(["error: nuhokai/tsconfig.json:3:5: Unknown compiler option 'bogusOption'."]);
  writeFileSync(tsconfig, original.replace("{", "{ ,"));
  const broken = await typeCheck(root);
  expect(broken.length).toBeGreaterThan(0);
  expect(broken.every((line) => line.startsWith("error: nuhokai/tsconfig.json:1:"))).toBe(true);
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

test("a programming error inside a checker session is no checker failure: it propagates as it is", async () => {
  const root = await world();
  const bug = new TypeError("boom");
  const session = { root, config: join(root, "nuhokai/tsconfig.json"), name: "tsconfig", checker: checkerPath() };
  await expect(
    withChecker(session, async () => {
      throw bug;
    }),
  ).rejects.toBe(bug);
});
