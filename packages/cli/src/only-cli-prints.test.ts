import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isCallExpression,
  isIdentifier,
  isNumericLiteral,
  isPropertyAccessExpression,
  isPropertyAssignment,
  type Node,
  type SourceFile,
  SyntaxKind,
} from "typescript/unstable/ast";
import { API } from "typescript/unstable/async";
import { checkerPath } from "./check/type-check.ts";
import { loadWorld } from "./load/load-world.ts";

const SRC = import.meta.dir;
const PACKAGE = join(SRC, "..");

/** Every script kind a source file can be: TypeScript and JavaScript, modules, CommonJS and JSX. */
const SCRIPT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const TEST = /\.test\.[cm]?[jt]sx?$/;

/** What code but Cli may read off process: facts about the machine and the run, none of them the terminal. */
const PROCESS_READS = new Set(["arch", "cwd", "env", "execPath", "platform"]);
const STD_STREAMS = new Set(["stdin", "stdout", "stderr"]);
/** Modules that are the terminal or the process: imported, they reach it without naming console or process. */
const TERMINAL_MODULES = new Set(["console", "process", "readline", "readline/promises", "tty"]);
/** Calls that take a file descriptor first: given 0, 1 or 2 they write to or read from the terminal. */
const FD_CALLS = new Set(["file", "write", "writeSync", "read", "readSync"]);
const DEVICES = /\/dev\/(?:tty|stdin|stdout|stderr|fd\/)|\/proc\/self\/fd/;
const LITERALS = new Set([
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
]);
const SPECIFIER_PARENTS = new Set([
  SyntaxKind.ImportDeclaration,
  SyntaxKind.ExportDeclaration,
  SyntaxKind.ExternalModuleReference,
  SyntaxKind.LiteralType,
  SyntaxKind.CallExpression,
]);

/**
 * Every place the file reaches the terminal or the process's exit, as `<line>: <code>`: console or globalThis at
 * all; process but to read PROCESS_READS; Bun's std streams or Bun itself aliased; a terminal module imported; a
 * descriptor call on 0, 1 or 2; a device path. Read from the syntax tree, so comments and strings never count.
 */
function offences(file: SourceFile): string[] {
  const found: string[] = [];
  const offence = (node: Node) =>
    found.push(`${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${node.getText(file)}`);
  const visit = (node: Node): void => {
    const parent = node.parent;
    // A property named like a global (`x.console`, `{ process: … }`) is not the global.
    const named = (isPropertyAccessExpression(parent) || isPropertyAssignment(parent)) && parent.name === node;
    if (isIdentifier(node) && !named) {
      const member = isPropertyAccessExpression(parent) && parent.expression === node ? parent.name : undefined;
      const memberName = member && isIdentifier(member) ? member.text : undefined;
      if (node.text === "console" || node.text === "globalThis") offence(parent);
      else if (node.text === "process" && !(memberName && PROCESS_READS.has(memberName))) offence(parent);
      else if (node.text === "Bun" && (!memberName || STD_STREAMS.has(memberName))) offence(parent);
    } else if (LITERALS.has(node.kind)) {
      const text = (node as Node & { text: string }).text;
      const specifier = SPECIFIER_PARENTS.has(parent.kind) && TERMINAL_MODULES.has(text.replace(/^node:/, ""));
      if (specifier || DEVICES.test(text)) offence(parent);
    } else if (isCallExpression(node)) {
      const callee = node.expression;
      const name = isIdentifier(callee)
        ? callee.text
        : isPropertyAccessExpression(callee) && isIdentifier(callee.name)
          ? callee.name.text
          : undefined;
      const first = node.arguments[0];
      if (name && FD_CALLS.has(name) && first && isNumericLiteral(first) && Number(first.text) <= 2) offence(node);
    }
    node.forEachChild(visit);
  };
  file.forEachChild(visit);
  return found;
}

/** Code written past the guard, one way per line: each line must be found. */
const BYPASSES = `import { stdout } from "node:process";
import { log } from "node:console";
import * as readline from "readline";
const { stderr } = process;
const c = console;
console["log"]("x");
process["exitCode"] = 3;
process.kill(process.pid);
writeSync(1, "x");
Bun.write(Bun.stdout, "x");
const tty = await import("node:tty");
globalThis.setTimeout(() => {});
Bun.file("/dev/tty");
export { exit } from "process";
const { stdin } = Bun;
`;

/** Code that only mentions the terminal, or reads what code may read: none of it may be found. */
const MENTIONS = `import { writeSync } from "node:fs";
// console.log("x"); process.exit(1);
/* process.stdout.write("x") */
const text = "console.log and process.exitCode = 1 and Bun.stdout";
const facts = [process.env.HOME, process.cwd(), process.platform, process.arch, process.execPath];
const result = { process: "a", console: undefined };
writeSync(3, text);
Bun.resolveSync("x", ".");
`;

/** The parsed files, by path relative to their directory: src's and the fixtures'. */
const parsed = new Map<string, SourceFile>();
let fixtures = "";

/** The source files the guard holds to: every script under src but bin.ts, tests and generated files. */
function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .map((path) => path.split("\\").join("/"))
    .filter((path) => SCRIPT.test(path) && path !== "bin.ts" && !TEST.test(path) && !path.endsWith(".gen.ts"));
}

beforeAll(async () => {
  fixtures = mkdtempSync(join(tmpdir(), "nuhokai-only-cli-prints-"));
  writeFileSync(join(fixtures, "bypasses.ts"), BYPASSES);
  writeFileSync(join(fixtures, "mentions.ts"), MENTIONS);
  writeFileSync(join(fixtures, "module.mjs"), 'console.log("x");\n');
  const files = [
    ...sourceFiles().map((path) => [path, join(SRC, path)] as const),
    ...["bypasses.ts", "mentions.ts", "module.mjs"].map((name) => [`fixture:${name}`, join(fixtures, name)] as const),
  ];
  const tsconfig = join(fixtures, "tsconfig.json");
  const compilerOptions = { allowJs: true, noResolve: true, noLib: true, noEmit: true, types: [] };
  writeFileSync(tsconfig, JSON.stringify({ compilerOptions, files: files.map(([, path]) => path) }));
  // Parsed by the CLI's own pinned checker, which has no parser outside a project.
  const api = new API({ cwd: fixtures, tsserverPath: checkerPath() });
  try {
    const snapshot = await api.updateSnapshot({ openProject: tsconfig });
    const program = snapshot.getProject(tsconfig)?.program;
    if (!program) throw new Error(`no project for ${tsconfig}`);
    for (const [name, path] of files) {
      const file = await program.getSourceFile(path);
      if (!file) throw new Error(`not parsed: ${path}`);
      parsed.set(name, file);
    }
  } finally {
    await api.close();
  }
});

afterAll(() => {
  if (fixtures) rmSync(fixtures, { recursive: true, force: true });
});

/** The offences in a parsed file, by its name in `parsed`. */
function offencesIn(name: string): string[] {
  const file = parsed.get(name);
  if (!file) throw new Error(`not parsed: ${name}`);
  return offences(file);
}

test("Cli R9: no source file but bin.ts touches the terminal; commands return a Report instead", () => {
  const files = sourceFiles();
  expect(files).toContain("check/check-world.ts");
  expect(files).toContain("map/scene.js");
  const found = Object.fromEntries(
    files.map((path) => [path, offencesIn(path)] as const).filter(([, lines]) => lines.length > 0),
  );
  expect(found).toEqual({});
});

test("the guard finds every way past it, in any script kind, and nothing in comments, strings or allowed reads", () => {
  const lines = (name: string) => offencesIn(`fixture:${name}`).map((at) => Number.parseInt(at, 10));
  const bypasses = BYPASSES.trimEnd().split("\n");
  expect([...new Set(lines("bypasses.ts"))]).toEqual(bypasses.map((_, index) => index + 1));
  expect(offencesIn("fixture:mentions.ts")).toEqual([]);
  expect(lines("module.mjs")).toEqual([1]);
});

test("Cli R9: in the CLI's own world only Cli uses Terminal", async () => {
  const world = await loadWorld(PACKAGE);
  const terminal = world.nodes.find((spec) => spec.name === "Terminal" && spec.external);
  expect(terminal).toBeDefined();
  const users = world.nodes
    .filter((spec) => spec.edges?.some((edge) => edge.kind === "uses" && edge.to === terminal?.id))
    .map((spec) => spec.name);
  expect(users).toEqual(["Cli"]);
});
