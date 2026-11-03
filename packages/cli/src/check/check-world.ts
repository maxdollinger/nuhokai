import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { isExpected, oneLine } from "../shared/failure.ts";
import { NoWorldError } from "../shared/inspect.ts";
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

/** A check's outcome: what it answered, or the failure that stopped it. */
type Outcome<T> = { readonly value: T } | { readonly failure: unknown };

async function outcome<T>(check: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { value: await check() };
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
 * The check command for the project directory `root`, named from the cwd: load once; without a world, stop there.
 * Then TypeCheck beside SpecCheck, or TypeCheck alone when the load failed, then CodeCheck when neither found an
 * error. Prints TypeCheck's findings, then SpecCheck's, then CodeCheck's, one line each on stdout, and one
 * 'nuhokai check: ' stderr line per failure; resolves to 0 without errors (warnings allowed), else 1. Programming
 * errors propagate and crash with their stack.
 */
export async function runCheck(root: string, environment: CheckEnvironment = {}): Promise<number> {
  const out = environment.out ?? ((line: string) => console.log(line));
  const err = environment.err ?? ((line: string) => console.error(line));
  const fail = (failure: unknown) => {
    // Expected failures become one stderr line; a bug crashes with its stack.
    if (!isExpected(failure)) throw failure;
    err(`nuhokai check: ${oneLine(failure)}`);
  };

  const loaded = await outcome(() => loadWorld(root));
  // No world: TypeCheck would only fail again for the same reason, so the one line is LoadWorld's.
  if ("failure" in loaded && loaded.failure instanceof NoWorldError) {
    fail(loaded.failure);
    return 1;
  }
  const typing = outcome(() => runTypeCheck(root));
  /** TypeCheck's findings, named by the loaded world when there is one; its failure after them. */
  const reportTypes = (typed: Outcome<Finding[]>, world: LoadedWorld | undefined): Finding[] => {
    const findings = "value" in typed ? nameTypeFindings(typed.value, world) : [];
    for (const finding of findings) out(formatFinding(finding));
    if ("failure" in typed) fail(typed.failure);
    return findings;
  };

  // A broken world still gets every tsc finding, which say most about why it does not load; then the load failure.
  if ("failure" in loaded) {
    reportTypes(await typing, undefined);
    fail(loaded.failure);
    return 1;
  }
  const world = loaded.value;
  const typed = await typing;
  const typeFindings = reportTypes(typed, world);
  // After a type error SpecCheck leaves out R5: it re-checks tsc's rules, so it would report the same break twice.
  const typeErrors = typeFindings.some((finding) => finding.severity === "error");
  const specced = await outcome(async () => runSpecCheck(root, world, typeErrors));
  if ("failure" in specced) {
    fail(specced.failure);
    return 1;
  }
  const specFindings = specced.value;
  for (const finding of specFindings) out(formatFinding(finding));
  const errors = [...typeFindings, ...specFindings].some((finding) => finding.severity === "error");
  if ("failure" in typed || errors) return 1;

  const codeFindings = runCodeCheck(world);
  for (const finding of codeFindings) out(formatFinding(finding));
  return codeFindings.some((finding) => finding.severity === "error") ? 1 : 0;
}
