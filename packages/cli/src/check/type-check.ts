import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createScanner, type Node, type SourceFile, SyntaxKind } from "typescript/unstable/ast";
import { API, type Diagnostic, DiagnosticCategory } from "typescript/unstable/async";
import { CliError } from "../shared/failure.ts";
import { inWorld, WORLD_GENERATED_DIR, WORLD_TSCONFIG } from "../shared/paths.ts";
import type { Finding } from "./diagnostics.ts";

/** The only callees a world file may call (TypeCheck R2). */
const ALLOWED_CALLS = "node, .edges, defineWorld, tbd.call, tbd.event and inherited";

/**
 * The CLI's pinned checker: the release ships tsgo as a sidecar next to the compiled binary (`tsgo/tsgo`); from
 * source, it is the platform build of the repo's pinned `typescript`. Never the repo's own TypeScript.
 */
function checkerPath(): string {
  const sidecar = join(dirname(process.execPath), "tsgo", "tsgo");
  if (existsSync(sidecar)) return sidecar;
  try {
    const typescript = dirname(Bun.resolveSync("typescript/package.json", import.meta.dir));
    const platform = `@typescript/typescript-${process.platform}-${process.arch}/package.json`;
    const binary = join(dirname(Bun.resolveSync(platform, typescript)), "lib", "tsc");
    if (existsSync(binary)) return binary;
  } catch {
    // Not resolvable: a compiled binary without its sidecar.
  }
  throw new CliError(`no type checker: expected ${sidecar}, which ships next to the nuhokai binary`);
}

/** A diagnostic's text with its chain, one message per line; Diagnostics flattens it. */
function messageOf(diagnostic: Diagnostic): string {
  return [diagnostic.text, ...(diagnostic.messageChain ?? []).map(messageOf)].join("\n");
}

/** The 1-based line of a position. */
function lineOf(file: SourceFile, position: number): number {
  return file.getLineAndCharacterOfPosition(position).line + 1;
}

/** How a message names a callee: its source text, shortened. */
function calleeText(file: SourceFile, node: Node): string {
  const text = file.text.slice(node.getStart(file), node.end).replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

/** Whether a call's callee is one of the declarative calls. */
function isAllowedCallee(callee: Node): boolean {
  if (callee.kind === SyntaxKind.Identifier) {
    return ["node", "defineWorld", "inherited"].includes((callee as Node & { text: string }).text);
  }
  if (callee.kind !== SyntaxKind.PropertyAccessExpression) return false;
  const access = callee as Node & { expression: Node & { text?: string }; name: Node & { text?: string } };
  if (access.name.text === "edges") return true;
  return (
    access.expression.kind === SyntaxKind.Identifier &&
    access.expression.text === "tbd" &&
    (access.name.text === "call" || access.name.text === "event")
  );
}

/** Whether a cast is `as const` (or `<const>`): it only narrows a literal, so it bypasses no rule. */
function isConstAssertion(cast: Node): boolean {
  const type = (cast as Node & { type?: Node & { typeName?: Node & { text?: string } } }).type;
  return type?.kind === SyntaxKind.TypeReference && type.typeName?.text === "const";
}

/**
 * TypeCheck R2 on one world file: calls only to the declarative calls, imports only @nuhokai/world and files under
 * the world folder, and no cast, non-null assertion, any or @ts- directive. One finding per offence, at its line.
 */
function declarativeFindings(file: SourceFile, worldDir: string, name: string): Finding[] {
  const findings: Finding[] = [];
  const error = (node: Node | number, rule: string, fix: string) =>
    findings.push({
      severity: "error",
      file: name,
      line: lineOf(file, typeof node === "number" ? node : node.getStart(file)),
      rule,
      fix,
    });
  const checkSpecifier = (node: Node, specifier: Node | undefined) => {
    if (!specifier) return;
    const text = specifier.kind === SyntaxKind.StringLiteral ? (specifier as Node & { text: string }).text : undefined;
    if (text === "@nuhokai/world") return;
    if (text !== undefined && (text.startsWith("./") || text.startsWith("../"))) {
      const target = resolve(dirname(file.fileName), text);
      if (target.startsWith(`${worldDir}${sep}`)) return;
    }
    error(
      node,
      `world files import only @nuhokai/world and files under nuhokai/, not ${text === undefined ? "a computed module" : `"${text}"`}`,
      "move what the import provides into the world, or drop the import",
    );
  };
  const visit = (node: Node): void => {
    switch (node.kind) {
      case SyntaxKind.CallExpression: {
        const callee = (node as Node & { expression: Node }).expression;
        if (!isAllowedCallee(callee)) {
          error(
            node,
            `world files are declarative: they call only ${ALLOWED_CALLS}, not ${calleeText(file, callee)}(...)`,
            "write the value out as data",
          );
        }
        break;
      }
      case SyntaxKind.NewExpression:
      case SyntaxKind.TaggedTemplateExpression:
        error(node, `world files are declarative: calls only to ${ALLOWED_CALLS}`, "write the value out as data");
        break;
      case SyntaxKind.ImportDeclaration:
      case SyntaxKind.ExportDeclaration:
        checkSpecifier(node, (node as Node & { moduleSpecifier?: Node }).moduleSpecifier);
        break;
      case SyntaxKind.ImportEqualsDeclaration:
        error(node, "world files import with import declarations only", 'use import { ... } from "..."');
        break;
      case SyntaxKind.ImportType: {
        const argument = (node as Node & { argument: Node & { literal?: Node } }).argument;
        checkSpecifier(node, argument.literal);
        break;
      }
      case SyntaxKind.AsExpression:
      case SyntaxKind.TypeAssertionExpression:
        // `as const` only narrows a literal: it bypasses nothing, so it is allowed.
        if (isConstAssertion(node)) break;
        error(
          node,
          "world files use no cast; it bypasses the rules tsc checks",
          "drop the cast and fix the type error",
        );
        // The cast's own type, `as any` included, is the same offence: only the expression is visited on.
        visit((node as Node & { expression: Node }).expression);
        return;
      case SyntaxKind.NonNullExpression:
        error(node, "world files use no non-null assertion", "drop the ! and handle the missing value");
        break;
      case SyntaxKind.AnyKeyword:
        error(node, "world files use no any; it bypasses the rules tsc checks", "name the real type");
        break;
    }
    node.forEachChild(visit);
  };
  file.forEachChild(visit);
  // Comments are trivia, not nodes: scan for them.
  const scanner = createScanner(false, file.languageVariant, file.text);
  for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
    if (token !== SyntaxKind.SingleLineCommentTrivia && token !== SyntaxKind.MultiLineCommentTrivia) continue;
    const directive = /@ts-[a-z-]+/.exec(scanner.getTokenText());
    if (directive) {
      error(
        scanner.getTokenStart(),
        `world files use no ${directive[0]} directive; it hides what tsc reports`,
        "drop the directive and fix the error",
      );
    }
  }
  return findings;
}

/**
 * Type-check the world of the project directory `root` (named from the cwd) with the CLI's pinned checker and
 * nuhokai/tsconfig.json: one error per tsc error and per breach of the declarative rule, in every *.ts under
 * nuhokai/ but .generated/, test files included. Without the tsconfig, one failure saying how to restore it.
 */
export async function runTypeCheck(root: string): Promise<Finding[]> {
  const tsconfig = inWorld(root, WORLD_TSCONFIG);
  if (!existsSync(tsconfig)) {
    throw new CliError(
      `${tsconfig}: not found; it is CLI-owned: copy it from a fresh \`nuhokai init\` (\`nuhokai update\` will restore it)`,
    );
  }
  const worldDir = resolve(inWorld(root));
  const generated = resolve(inWorld(root, WORLD_GENERATED_DIR));
  /** A world file named as the loader names it: under the project directory as `root` names it. */
  const nameOf = (path: string) => inWorld(root, ...relative(worldDir, path).split(sep));
  const inWorldFiles = (path: string) =>
    path.startsWith(`${worldDir}${sep}`) && !path.startsWith(`${generated}${sep}`) && path.endsWith(".ts");
  const api = new API({ cwd: resolve(root), tsserverPath: checkerPath() });
  try {
    const config = resolve(tsconfig);
    const snapshot = await api.updateSnapshot({ openProject: config });
    const project = snapshot.getProject(config) ?? snapshot.getProjects()[0];
    if (!project) throw new CliError(`${tsconfig}: the checker opened no project`);
    const program = project.program;
    const names = (await program.getSourceFileNames()).map((path) => resolve(path)).filter(inWorldFiles);
    const files = new Map<string, SourceFile>();
    for (const path of names) {
      const file = await program.getSourceFile(path);
      if (file) files.set(path, file);
    }
    const diagnostics = [
      ...(await program.getConfigFileParsingDiagnostics()),
      ...(await program.getProgramDiagnostics()),
      ...(await program.getGlobalDiagnostics()),
      ...(await program.getSyntacticDiagnostics()),
      ...(await program.getSemanticDiagnostics()),
    ];
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const diagnostic of diagnostics) {
      if (diagnostic.category !== DiagnosticCategory.Error) continue;
      const key = `${diagnostic.fileName}:${diagnostic.pos}:${diagnostic.code}:${diagnostic.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (diagnostic.fileName === undefined) {
        findings.push({ severity: "error", file: tsconfig, rule: messageOf(diagnostic) });
        continue;
      }
      const path = resolve(diagnostic.fileName);
      if (!inWorldFiles(path)) continue;
      const file = files.get(path);
      findings.push({
        severity: "error",
        file: nameOf(path),
        ...(file ? { line: lineOf(file, diagnostic.pos) } : {}),
        rule: messageOf(diagnostic),
      });
    }
    for (const [path, file] of files) findings.push(...declarativeFindings(file, worldDir, nameOf(path)));
    return findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : (a.line ?? 0) - (b.line ?? 0)));
  } finally {
    await api.close();
  }
}
