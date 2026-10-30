import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  createScanner,
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  isNamedImports,
  isPropertyAccessExpression,
  isStringLiteral,
  type Node,
  type SourceFile,
  SyntaxKind,
} from "typescript/unstable/ast";
import { API, type Diagnostic, DiagnosticCategory } from "typescript/unstable/async";
import { CliError, oneLine } from "../shared/failure.ts";
import { inWorld, WORLD_GENERATED_DIR, WORLD_TSCONFIG } from "../shared/paths.ts";
import { compareFindings, type Finding } from "./diagnostics.ts";

/** The only callees a world file may call (TypeCheck R2). */
const ALLOWED_CALLS = "node, .edges, defineWorld, tbd.call, tbd.event and inherited";

/** The names TypeCheck R2's calls go through; each counts only as its import from @nuhokai/world. */
const WORLD_NAMES = ["node", "defineWorld", "inherited", "tbd"];

/** The kinds of node that declare a value name in their `name`. */
const DECLARATIONS = new Set([
  SyntaxKind.VariableDeclaration,
  SyntaxKind.Parameter,
  SyntaxKind.BindingElement,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.ClassExpression,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.ModuleDeclaration,
  SyntaxKind.ImportEqualsDeclaration,
  SyntaxKind.ImportClause,
  SyntaxKind.NamespaceImport,
  SyntaxKind.ImportSpecifier,
]);

/** The literals whose text the comment scan skips: a scanner without the parser cannot tell where templates end. */
const LITERALS = new Set([
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
  SyntaxKind.RegularExpressionLiteral,
]);

/**
 * The CLI's pinned checker. The compiled CLI uses the tsgo the release ships as a sidecar next to the binary
 * (`tsgo/tsgo`); from source or the bundle, the platform build of the CLI's pinned `typescript`. Never the repo's own
 * TypeScript.
 */
function checkerPath(): string {
  if (import.meta.dir.startsWith("/$bunfs")) {
    const sidecar = join(dirname(process.execPath), "tsgo", "tsgo");
    if (existsSync(sidecar)) return sidecar;
    throw new CliError(`no type checker: expected ${sidecar}, which ships next to the nuhokai binary`);
  }
  const platform = `@typescript/typescript-${process.platform}-${process.arch}`;
  try {
    const typescript = dirname(Bun.resolveSync("typescript/package.json", import.meta.dir));
    const binary = join(dirname(Bun.resolveSync(`${platform}/package.json`, typescript)), "lib", "tsc");
    if (existsSync(binary)) return binary;
  } catch {
    // Not installed: the failure below says so.
  }
  throw new CliError(`no type checker: ${platform} is not installed; run bun install`);
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

/**
 * The names of WORLD_NAMES the file imports from @nuhokai/world under their own name and declares nowhere else, so
 * a call through them is the world's.
 */
function worldBindings(file: SourceFile): Set<string> {
  const declared = new Map<string, number>();
  const imported: string[] = [];
  const visit = (node: Node): void => {
    const name = (node as Node & { name?: Node }).name;
    if (DECLARATIONS.has(node.kind) && name && isIdentifier(name)) {
      declared.set(name.text, (declared.get(name.text) ?? 0) + 1);
    }
    const clause = isImportDeclaration(node) ? node.importClause : undefined;
    if (
      clause?.namedBindings &&
      clause.phaseModifier === undefined &&
      isNamedImports(clause.namedBindings) &&
      isImportDeclaration(node) &&
      isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "@nuhokai/world"
    ) {
      for (const specifier of clause.namedBindings.elements) {
        const exported = specifier.propertyName ?? specifier.name;
        if (!specifier.isTypeOnly && isIdentifier(exported) && exported.text === specifier.name.text) {
          imported.push(specifier.name.text);
        }
      }
    }
    node.forEachChild(visit);
  };
  file.forEachChild(visit);
  return new Set(imported.filter((name) => WORLD_NAMES.includes(name) && declared.get(name) === 1));
}

/**
 * Whether a call's callee is one of the declarative calls: node, defineWorld or inherited, tbd.call or tbd.event,
 * each through its import from @nuhokai/world, or .edges on such a node(...) call.
 */
function isAllowedCallee(callee: Node, bound: ReadonlySet<string>): boolean {
  const isBound = (node: Node, name: string) => isIdentifier(node) && node.text === name && bound.has(name);
  if (isIdentifier(callee)) return callee.text !== "tbd" && bound.has(callee.text);
  if (!isPropertyAccessExpression(callee) || !isIdentifier(callee.name)) return false;
  const receiver = callee.expression;
  if (callee.name.text === "edges") return isCallExpression(receiver) && isBound(receiver.expression, "node");
  return (callee.name.text === "call" || callee.name.text === "event") && isBound(receiver, "tbd");
}

/**
 * Every comment in the file, by its start: a scan of the text that skips each literal the parser found, so text
 * inside a string, template or regular expression is never read as a comment, nor a comment after one missed.
 */
function commentsOf(file: SourceFile): { start: number; text: string }[] {
  const literals = new Map<number, number>();
  const collect = (node: Node): void => {
    if (LITERALS.has(node.kind)) literals.set(node.getStart(file), node.end);
    node.forEachChild(collect);
  };
  file.forEachChild(collect);
  const comments: { start: number; text: string }[] = [];
  const scanner = createScanner(false, file.languageVariant, file.text);
  for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
    const end = literals.get(scanner.getTokenStart());
    if (end !== undefined) scanner.resetTokenState(end);
    else if (token === SyntaxKind.SingleLineCommentTrivia || token === SyntaxKind.MultiLineCommentTrivia) {
      comments.push({ start: scanner.getTokenStart(), text: scanner.getTokenText() });
    }
  }
  return comments;
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
  const bound = worldBindings(file);
  const visit = (node: Node): void => {
    switch (node.kind) {
      case SyntaxKind.CallExpression: {
        const callee = (node as Node & { expression: Node }).expression;
        if (!isAllowedCallee(callee, bound)) {
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
  for (const comment of commentsOf(file)) {
    const directive = /@ts-[a-z-]+/.exec(comment.text);
    if (directive) {
      error(
        comment.start,
        `world files use no ${directive[0]} directive; it hides what tsc reports`,
        "drop the directive and fix the error",
      );
    }
  }
  return findings;
}

/** What the checker answered: the world files it parsed, by absolute path, and its diagnostics. */
interface Checked {
  readonly files: ReadonlyMap<string, SourceFile>;
  readonly diagnostics: readonly Diagnostic[];
}

/** A checker or API failure as one CliError; a CliError of ours passes as it is. */
function checkerFailure(error: unknown): CliError {
  return error instanceof CliError ? error : new CliError(`the type checker failed: ${oneLine(error)}`);
}

/**
 * Ask the checker at `checker` for the project of nuhokai/tsconfig.json under `root`: the world files `inWorldFiles`
 * keeps and every diagnostic. Every failure, the checker's closing included, is one CliError; a failure closing it
 * after another never hides that other.
 */
async function askChecker(
  root: string,
  tsconfig: string,
  checker: string,
  inWorldFiles: (path: string) => boolean,
): Promise<Checked> {
  let api: API;
  try {
    api = new API({ cwd: resolve(root), tsserverPath: checker });
  } catch (error) {
    throw checkerFailure(error);
  }
  let checked: Checked;
  try {
    const config = resolve(tsconfig);
    const snapshot = await api.updateSnapshot({ openProject: config });
    const project = snapshot.getProject(config);
    if (!project) throw new CliError(`${tsconfig}: the type checker opened no project for it`);
    const program = project.program;
    const files = new Map<string, SourceFile>();
    for (const path of (await program.getSourceFileNames()).map((name) => resolve(name)).filter(inWorldFiles)) {
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
    checked = { files, diagnostics };
  } catch (error) {
    await api.close().catch(() => {});
    throw checkerFailure(error);
  }
  try {
    await api.close();
  } catch (error) {
    throw checkerFailure(error);
  }
  return checked;
}

/** The 1-based line of a position in a file the checker did not parse, such as the tsconfig. */
function lineInText(path: string, position: number): number | undefined {
  try {
    return readFileSync(path, "utf8").slice(0, position).split("\n").length;
  } catch {
    return undefined;
  }
}

/**
 * Type-check the world of the project directory `root` (named from the cwd) with the CLI's pinned checker and
 * nuhokai/tsconfig.json: one error per tsc error and per breach of the declarative rule, in every *.ts under
 * nuhokai/ but .generated/, test files included, and one per error in the tsconfig itself. Without the tsconfig,
 * one failure saying how to restore it; a checker that fails to start or answer is one failure too. `checker` finds
 * the checker's executable.
 */
export async function runTypeCheck(root: string, checker: () => string = checkerPath): Promise<Finding[]> {
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
  const { files, diagnostics } = await askChecker(root, tsconfig, checker(), inWorldFiles);

  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.category !== DiagnosticCategory.Error) continue;
    const key = `${diagnostic.fileName}:${diagnostic.pos}:${diagnostic.code}:${diagnostic.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const path = diagnostic.fileName === undefined ? undefined : resolve(diagnostic.fileName);
    if (path === undefined || path === resolve(tsconfig)) {
      const line = path === undefined ? undefined : lineInText(path, diagnostic.pos);
      findings.push({ severity: "error", file: tsconfig, ...(line ? { line } : {}), rule: messageOf(diagnostic) });
      continue;
    }
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
  return findings.sort(compareFindings);
}
