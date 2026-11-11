import { existsSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { SourceFile } from "typescript/unstable/ast";
import { type Diagnostic, DiagnosticCategory } from "typescript/unstable/async";
import { positionIn } from "../load/reader.ts";
import { checkerPath, withChecker } from "../shared/checker-client.ts";
import { type Finding, locate, order } from "../shared/diagnostics.ts";
import { CliError } from "../shared/failure.ts";
import { nameInWorld, WORLD_GENERATED_DIR, WORLD_TSCONFIG } from "../shared/world-path.ts";
import { declarativeFindings } from "./declarative-rules.ts";
import { readTscError } from "./tsc-message.ts";

/** A diagnostic's messages, its own first, then its chain's in order. */
function messagesOf(diagnostic: Diagnostic): string[] {
  return [diagnostic.text, ...(diagnostic.messageChain ?? []).flatMap(messagesOf)];
}

/** tsc's codes for a module it cannot find (TS2307, TS2792). */
const UNRESOLVED_MODULE = new Set([2307, 2792]);

/** A tsc error's finding text, as readTscError reads its messages. */
function ruleOf(diagnostic: Diagnostic): { rule: string; fix?: string } {
  return readTscError(messagesOf(diagnostic));
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
  /** tsc's findings for a module it cannot resolve, by file:line:column: kept unless R2 refuses that import anyway. */
  const unresolved: [string, Finding][] = [];
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
    const at = file ? positionIn(file, diagnostic.pos) : undefined;
    const finding: Finding = {
      severity: "error",
      file: printedName(path),
      ...(at ? { line: at.line } : {}),
      ...ruleOf(diagnostic),
    };
    if (UNRESOLVED_MODULE.has(diagnostic.code)) unresolved.push([`${finding.file}:${at?.line}:${at?.column}`, finding]);
    else findings.push(finding);
  }
  /** Each specifier R2 refuses, by file:line:column. */
  const refused = new Set<string>();
  for (const [path, file] of files) {
    if (!unparsed.has(path)) findings.push(...declarativeFindings(file, worldDir, printedName(path), refused));
  }
  // An import R2 refuses already says what to do with it: tsc's "cannot find module" at its specifier says it again.
  findings.push(...unresolved.flatMap(([place, finding]) => (refused.has(place) ? [] : [finding])));
  return findings.sort(order);
}
