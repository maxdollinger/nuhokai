import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { isExpected, oneLine } from "../shared/failure.ts";
import { requireWorld } from "../shared/inspect.ts";
import { runCodeCheck } from "./code-check.ts";
import { type Finding, formatFinding } from "./diagnostics.ts";
import { runSpecCheck } from "./spec-check/index.ts";
import { worldTree } from "./spec-check/world-tree.ts";
import { runTypeCheck } from "./type-check.ts";

/** What the run port may observe and answer; the defaults are the real process. */
export interface CheckEnvironment {
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

/** A check's outcome: its findings, or the failure that stopped it. */
type Outcome = { readonly findings: Finding[] } | { readonly failure: unknown };

async function outcome(check: () => Promise<Finding[]>): Promise<Outcome> {
  try {
    return { findings: await check() };
  } catch (failure) {
    return { failure };
  }
}

/**
 * CheckWorld R3: a TypeCheck finding names its node only when the load succeeded and its file defines exactly one
 * node, an orphan counted too, by the node's path from the world.
 */
function nameTypeFindings(findings: readonly Finding[], world: LoadedWorld | undefined): Finding[] {
  if (!world) return [...findings];
  const tree = worldTree(world);
  const defined = new Map<string, (string | undefined)[]>();
  const define = (file: string, path: string | undefined) => defined.set(file, [...(defined.get(file) ?? []), path]);
  for (const [index, entry] of world.files.entries()) define(entry.file, tree.nodes[index]?.path);
  for (const orphan of world.orphans) define(orphan.file, undefined);
  return findings.map((finding) => {
    const paths = defined.get(finding.file);
    if (finding.node !== undefined || paths?.length !== 1 || paths[0] === undefined) return finding;
    return { ...finding, node: paths[0] };
  });
}

/**
 * The check command for the project directory `root`, named from the cwd: TypeCheck beside one load and SpecCheck,
 * then CodeCheck when neither found an error. Prints TypeCheck's findings, then SpecCheck's, then CodeCheck's, one
 * line each on stdout, and one 'nuhokai check: ' stderr line per failure; resolves to 0 without errors (warnings
 * allowed), else 1. Programming errors propagate and crash with their stack.
 */
export async function runCheck(root: string, environment: CheckEnvironment = {}): Promise<number> {
  const out = environment.out ?? ((line: string) => console.log(line));
  const err = environment.err ?? ((line: string) => console.error(line));
  const fail = (failure: unknown) => {
    // Expected failures become one stderr line; a bug crashes with its stack.
    if (!isExpected(failure)) throw failure;
    err(`nuhokai check: ${oneLine(failure)}`);
  };

  try {
    requireWorld(root);
  } catch (failure) {
    fail(failure);
    return 1;
  }
  let world: LoadedWorld | undefined;
  const [typed, specced] = await Promise.all([
    outcome(() => runTypeCheck(root)),
    outcome(async () => {
      world = await loadWorld(root);
      return runSpecCheck(root, world);
    }),
  ]);

  const typeFindings = "findings" in typed ? nameTypeFindings(typed.findings, world) : [];
  for (const finding of typeFindings) out(formatFinding(finding));
  if ("failure" in typed) fail(typed.failure);
  // A load failure ends the run after TypeCheck's findings.
  if ("failure" in specced) {
    fail(specced.failure);
    return 1;
  }
  for (const finding of specced.findings) out(formatFinding(finding));
  const errors = [...typeFindings, ...specced.findings].some((finding) => finding.severity === "error");
  if ("failure" in typed || errors || !world) return 1;

  const codeFindings = runCodeCheck(world);
  for (const finding of codeFindings) out(formatFinding(finding));
  return codeFindings.some((finding) => finding.severity === "error") ? 1 : 0;
}
