import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { createScanner, type Node, type SourceFile, SyntaxKind } from "typescript/unstable/ast";
import { type Diagnostic, DiagnosticCategory } from "typescript/unstable/async";
import { checkerPath, withChecker } from "../shared/checker-client.ts";
import { type Finding, locate, order } from "../shared/diagnostics.ts";
import { CliError } from "../shared/failure.ts";
import { nameInWorld, WORLD_GENERATED_DIR, WORLD_TSCONFIG } from "../shared/world-path.ts";

/** The literals whose text the comment scan skips: a scanner without the parser cannot tell where templates end. */
const LITERALS = new Set([
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
  SyntaxKind.RegularExpressionLiteral,
]);

/** A diagnostic's messages, its own first, then its chain's in order. */
function messagesOf(diagnostic: Diagnostic): string[] {
  return [diagnostic.text, ...(diagnostic.messageChain ?? []).flatMap(messagesOf)];
}

/**
 * A quoted type that is a `Forbidden<"…">` the error is about: the whole type, or the last member of its intersection
 * (`X & Forbidden<"…">`, also under NoInfer). One inside an object type the error is not about (`{ readonly
 * externalType?: Forbidden<"…">; }` beside an unknown property) is no match.
 */
const FORBIDDEN = /(?:^|& )(?:readonly )?(?:NoInfer<)?Forbidden<"((?:[^"\\]|\\.)*)">>?(?:\[\])?$/;

/**
 * An object type longer than this, where tsc names the type of a value the reader wrote (the type of a literal,
 * not the one it should match), is that literal spelled out: `{ … }` says enough.
 */
const LONG_OBJECT = 40;

/** The text before a quoted type that names the type of the reader's value, not the type it should match. */
const VALUE_TYPE = /(?:^|\. )Type $|Argument of type $|is missing in type $/;

/** tsc's codes for a module it cannot find (TS2307, TS2792). */
const UNRESOLVED_MODULE = new Set([2307, 2792]);

/** How R2's finding for an import from outside the world starts. */
const IMPORT_RULE = "world files import only @nuhokai/world";

/** tsc's advice to install type definitions or change the library: a world file's fix is never either. */
const SETUP_ADVICE = / Do you need to [^?]*\?.*$/;

/** The fix for a name or member tsc advised installing or a newer library for. */
const SETUP_FIX =
  "remove the code that uses it: world files hold data only (do not edit nuhokai/tsconfig.json, it is CLI-owned)";

/** Generics whose own name says nothing: their type argument stands in their place. */
const TRANSPARENT = new Set(["NoInfer", "Readonly"]);

/** The index just past the string or template literal whose quote is at `start`, past its escapes. */
function pastLiteral(text: string, start: number): number {
  return closedLiteral(text, start) ?? text.length;
}

/**
 * The index just past the literal whose quote is at `start`, or undefined when it never closes: tsc cuts a long
 * type off mid-literal (`"01a...`), and the rest of its message is no literal.
 */
function closedLiteral(text: string, start: number): number | undefined {
  const quote = text[start];
  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === "\\") index++;
    else if (text[index] === quote) return index + 1;
  }
  return undefined;
}

/** The index just past the `close` matching the `open` at `start`; a literal's text holds no bracket of the type. */
function pastMatching(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (char === '"' || char === "`") index = pastLiteral(text, index) - 1;
    else if (char === open) depth++;
    else if (char === close && !(close === ">" && text[index - 1] === "=")) {
      depth--;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}

/**
 * A type as tsc printed it, cut to its names: a generic's arguments dropped (`NodeShape<undefined, {}, …>` →
 * `NodeShape`), but a Forbidden's message kept and a transparent generic replaced by its argument, and an object
 * type intersected onto a named one dropped (`NodeShape & { readonly ports?: {}; }` → `NodeShape`). The world
 * format's generics carry its bookkeeping, which says nothing about the error.
 */
function shortType(type: string): string {
  let short = "";
  for (let index = 0; index < type.length; ) {
    const name = /^[A-Za-z_$][\w$]*</.exec(type.slice(index));
    if (name === null) {
      const char = type[index] ?? "";
      if (char === '"' || char === "`") {
        const end = pastLiteral(type, index);
        short += type.slice(index, end);
        index = end;
        continue;
      }
      short += char;
      index++;
      continue;
    }
    const identifier = name[0].slice(0, -1);
    const end = pastMatching(type, index + identifier.length, "<", ">");
    // tsc cut the type off inside this generic's arguments: the name, and that it goes on.
    if (end === type.length && !type.endsWith(">")) short += `${identifier}<…>`;
    else if (identifier === "Forbidden") short += type.slice(index, end);
    else if (TRANSPARENT.has(identifier)) short += shortType(type.slice(index + identifier.length + 1, end - 1));
    else short += identifier;
    index = end;
  }
  // An object type after a named one is the format's per-node constraints, never what the error is about.
  for (let at = short.indexOf(" & {"); at > 0 && /[\w$\]>)]$/.test(short.slice(0, at)); at = short.indexOf(" & {")) {
    short = short.slice(0, at) + short.slice(pastMatching(short, at + 3, "{", "}"));
  }
  return short;
}

/**
 * A message cut at the types tsc quoted in it: text outside quotes and each quoted text in turn, starting outside.
 * A quote ends only outside the string and template literals inside it, so `'{ purpose: "the user's" }'` is one type.
 */
function quotedParts(message: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < message.length; index++) {
    const char = message[index];
    const literalEnd = quoted && (char === '"' || char === "`") ? closedLiteral(message, index) : undefined;
    if (literalEnd !== undefined) index = literalEnd - 1;
    else if (char === "'") {
      // An apostrophe in tsc's prose ("can't") opens no type.
      if (!quoted && /\p{L}/u.test(message[index - 1] ?? "") && /\p{L}/u.test(message[index + 1] ?? "")) continue;
      parts.push(message.slice(start, index));
      start = index + 1;
      quoted = !quoted;
    }
  }
  parts.push(message.slice(start));
  // A quote never closed opens no type either: it is text, with its quote.
  if (quoted) {
    const open = parts.pop() ?? "";
    parts.push(`${parts.pop() ?? ""}'${open}`);
  }
  return parts;
}

/** The Forbidden messages the types quoted in a message are about. */
function forbiddenIn(message: string): string[] {
  return quotedParts(message)
    .filter((_part, index) => index % 2 === 1)
    .flatMap((type) => FORBIDDEN.exec(type)?.[1] ?? []);
}

/**
 * Every type tsc quoted in a message, cut to its names, and the long object type of a value the reader wrote to
 * `{ … }`; a quoted type without a generic stays as it is.
 */
function shortTypes(message: string): string {
  return quotedParts(message)
    .map((part, index, parts) => {
      if (index % 2 === 0) return part;
      const valueType = VALUE_TYPE.test(parts[index - 1] ?? "");
      if (valueType && part.startsWith("{") && part.length > LONG_OBJECT) return "'{ … }'";
      return `'${part.includes("<") ? shortType(part) : part}'`;
    })
    .join("");
}

/**
 * What a tsc error says, as one rule and the fix when there is one. An error about a `Forbidden<"…">` is its message
 * alone, as the world format wrote it for the reader (TypeCheck R4); otherwise each message of the chain with its
 * types cut to their names, and tsc's advice to install types or change the library replaced by the world's fix.
 */
function readTscError(messages: readonly string[]): { rule: string; fix?: string; formatMessage?: true } {
  const forbidden = [...new Set(messages.flatMap(forbiddenIn))];
  if (forbidden.length > 0) {
    return { rule: forbidden.map((text) => (text ?? "").replace(/\\(.)/g, "$1")).join("; "), formatMessage: true };
  }
  const advised = messages.some((message) => SETUP_ADVICE.test(message));
  const rule = messages.map((message) => shortTypes(message.replace(SETUP_ADVICE, ""))).join(" ");
  // The fix follows after "; ", so the rule's own closing period goes.
  return advised ? { rule: rule.replace(/\.$/, ""), fix: SETUP_FIX } : { rule };
}

/** A tsc error's finding text, as readTscError reads its messages. */
function ruleOf(diagnostic: Diagnostic): { rule: string; fix?: string; formatMessage?: true } {
  return readTscError(messagesOf(diagnostic));
}

/** The 1-based line and column of a position. */
function lineOf(file: SourceFile, position: number): { line: number; column: number } {
  const { line, character } = file.getLineAndCharacterOfPosition(position);
  return { line: line + 1, column: character + 1 };
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
function declarativeFindings(file: SourceFile, worldDir: string, name: string, refused: Set<string>): Finding[] {
  const findings: Finding[] = [];
  const error = (node: Node | number, rule: string, fix: string) =>
    findings.push({
      severity: "error",
      file: name,
      ...lineOf(file, typeof node === "number" ? node : node.getStart(file)),
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
    const at = lineOf(file, specifier.getStart(file));
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
    throw new CliError(`${tsconfig}: not found; it is CLI-owned: copy it from a fresh \`nuhokai init\``);
  }
  const worldDir = resolve(nameInWorld(root));
  const generated = resolve(nameInWorld(root, WORLD_GENERATED_DIR));
  /** A world file named as the loader names it: under the project directory as `root` names it. */
  const printedName = (path: string) => nameInWorld(root, ...relative(worldDir, path).split(sep));
  const inWorldFiles = (path: string) =>
    path.startsWith(`${worldDir}${sep}`) && !path.startsWith(`${generated}${sep}`) && path.endsWith(".ts");
  const { files, syntactic, diagnostics } = await withChecker(
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
        ...(await program.getSemanticDiagnostics()),
      ];
      // Syntax errors apart: R5 keeps a file's first alone.
      return { files, syntactic: await program.getSyntacticDiagnostics(), diagnostics };
    },
  );

  // R5: a file that does not parse is its first syntax error alone; what follows it is the parser's guesswork.
  const firstSyntaxError = new Map<string | undefined, Diagnostic>();
  for (const diagnostic of syntactic) {
    const known = firstSyntaxError.get(diagnostic.fileName);
    if (!known || diagnostic.pos < known.pos) firstSyntaxError.set(diagnostic.fileName, diagnostic);
  }
  const unparsed = new Set([...firstSyntaxError.keys()].flatMap((name) => (name === undefined ? [] : resolve(name))));

  const findings: Finding[] = [];
  /** tsc's findings for a module it cannot resolve: kept unless R2 refuses that import anyway. */
  const unresolved: Finding[] = [];
  const seen = new Set<string>();
  for (const diagnostic of [...firstSyntaxError.values(), ...diagnostics]) {
    if (diagnostic.fileName !== undefined && firstSyntaxError.get(diagnostic.fileName) !== diagnostic) {
      if (unparsed.has(resolve(diagnostic.fileName))) continue;
    }
    if (diagnostic.category !== DiagnosticCategory.Error) continue;
    const key = `${diagnostic.fileName}:${diagnostic.pos}:${diagnostic.code}:${diagnostic.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const path = diagnostic.fileName === undefined ? undefined : resolve(diagnostic.fileName);
    if (path === undefined || path === resolve(tsconfig)) {
      const line = path === undefined ? undefined : lineInText(path, diagnostic.pos);
      findings.push({ severity: "error", ...locate({ file: tsconfig, line }), ...ruleOf(diagnostic) });
      continue;
    }
    if (!inWorldFiles(path)) continue;
    const file = files.get(path);
    const finding: Finding = {
      severity: "error",
      file: printedName(path),
      ...(file ? lineOf(file, diagnostic.pos) : {}),
      ...ruleOf(diagnostic),
    };
    if (UNRESOLVED_MODULE.has(diagnostic.code)) unresolved.push(finding);
    else findings.push(finding);
  }
  /** Each specifier R2 refuses, by file:line:column. */
  const refused = new Set<string>();
  for (const [path, file] of files) {
    if (!unparsed.has(path)) findings.push(...declarativeFindings(file, worldDir, printedName(path), refused));
  }
  // An import R2 refuses already says what to do with it: tsc's "cannot find module" at its specifier says it again.
  findings.push(...unresolved.filter((finding) => !refused.has(`${finding.file}:${finding.line}:${finding.column}`)));
  return findings.sort(order);
}
