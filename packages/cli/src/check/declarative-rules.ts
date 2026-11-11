/** TypeCheck R2: nothing in a world file bypasses or widens the type check. */
import { dirname, resolve, sep } from "node:path";
import { createScanner, type Node, type SourceFile, SyntaxKind } from "typescript/unstable/ast";
import { positionIn } from "../load/reader.ts";
import type { Finding } from "../shared/diagnostics.ts";

/** The literals whose text the comment scan skips: a scanner without the parser cannot tell where templates end. */
const LITERALS = new Set([
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
  SyntaxKind.RegularExpressionLiteral,
]);

/** How R2's finding for an import from outside the world starts. */
const IMPORT_RULE = "world files import only @nuhokai/world";

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
export function declarativeFindings(file: SourceFile, worldDir: string, name: string, refused: Set<string>): Finding[] {
  const findings: Finding[] = [];
  const error = (node: Node | number, rule: string, fix: string) =>
    findings.push({
      severity: "error",
      file: name,
      ...positionIn(file, typeof node === "number" ? node : node.getStart(file)),
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
    // Where tsc reports a module it cannot find: the specifier, wherever the import statement starts.
    const at = positionIn(file, specifier.getStart(file));
    refused.add(`${name}:${at.line}:${at.column}`);
    error(
      node,
      `${IMPORT_RULE} and files under nuhokai/, not ${text === undefined ? "a computed module" : `"${text}"`}`,
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
