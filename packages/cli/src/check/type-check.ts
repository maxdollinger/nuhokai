import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createScanner, type Node, type SourceFile, SyntaxKind } from "typescript/unstable/ast";
import { API, type Diagnostic, DiagnosticCategory, type Project } from "typescript/unstable/async";
import { CliError, errorLine } from "../shared/failure.ts";
import { nameInWorld, WORLD_GENERATED_DIR, WORLD_TSCONFIG } from "../shared/paths.ts";
import { compareFindings, type Finding } from "./diagnostics.ts";

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
export function checkerPath(): string {
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
 * TypeCheck R2 on one world file: imports only @nuhokai/world and files under the world folder, so the type check
 * never depends on the repo's packages, and no cast, non-null assertion, any or @ts- directive, so nothing bypasses
 * the rules tsc checks. One finding per offence, at its line. Whether the file is data is LoadWorld's to judge.
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

/** A checker or API failure as one CliError; a CliError of ours passes as it is. */
function checkerFailure(error: unknown): CliError {
  return error instanceof CliError ? error : new CliError(`the type checker failed: ${errorLine(error)}`);
}

/** A JavaScript runtime error: a bug in our code or the client's, never a checker failure to explain. */
function isProgrammingError(error: unknown): boolean {
  return error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError;
}

/** How to reach the checker: from `root`, the tsconfig at `config` (absolute), named `name` in messages. */
export interface CheckerSession {
  readonly root: string;
  readonly config: string;
  readonly name: string;
  /** The checker's executable. */
  readonly checker: string;
  /** Files the checker reads from memory instead of the disk, by absolute path, such as a tsconfig never written. */
  readonly virtual?: ReadonlyMap<string, string>;
}

/**
 * Open the session's project in the checker and answer what `use` makes of it. Every checker failure, its closing
 * included, is one CliError, a CliError of ours as it is; a failure closing the checker after another never hides that
 * other. A programming error is no checker failure: it propagates with its stack. LoadWorld and TypeCheck share it,
 * so both talk to the checker the same way.
 */
export async function withChecker<T>(session: CheckerSession, use: (project: Project) => Promise<T>): Promise<T> {
  const { root, config, name, checker, virtual } = session;
  let api: API;
  try {
    api = new API({
      cwd: resolve(root),
      tsserverPath: checker,
      ...(virtual && {
        fs: {
          readFile: (path: string) => virtual.get(resolve(path)),
          fileExists: (path: string) => (virtual.has(resolve(path)) ? true : undefined),
        },
      }),
    });
  } catch (error) {
    throw checkerFailure(error);
  }
  let result: T;
  try {
    const snapshot = await api.updateSnapshot({ openProject: config });
    const project = snapshot.getProject(config);
    if (!project) throw new CliError(`${name}: the type checker opened no project for it`);
    result = await use(project);
  } catch (error) {
    await api.close().catch(() => {});
    if (isProgrammingError(error)) throw error;
    throw checkerFailure(error);
  }
  try {
    await api.close();
  } catch (error) {
    throw checkerFailure(error);
  }
  return result;
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
  const tsconfig = nameInWorld(root, WORLD_TSCONFIG);
  if (!existsSync(tsconfig)) {
    throw new CliError(
      `${tsconfig}: not found; it is CLI-owned: copy it from a fresh \`nuhokai init\` (\`nuhokai update\` will restore it)`,
    );
  }
  const worldDir = resolve(nameInWorld(root));
  const generated = resolve(nameInWorld(root, WORLD_GENERATED_DIR));
  /** A world file named as the loader names it: under the project directory as `root` names it. */
  const nameOf = (path: string) => nameInWorld(root, ...relative(worldDir, path).split(sep));
  const inWorldFiles = (path: string) =>
    path.startsWith(`${worldDir}${sep}`) && !path.startsWith(`${generated}${sep}`) && path.endsWith(".ts");
  const { files, diagnostics } = await withChecker(
    { root, config: resolve(tsconfig), name: tsconfig, checker: checker() },
    async (project) => {
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
      return { files, diagnostics };
    },
  );

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
