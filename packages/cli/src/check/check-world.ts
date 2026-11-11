import { LoadError, type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { type Finding, format, locate, summarize } from "../shared/diagnostics.ts";
import { NoWorldError } from "../shared/inspect.ts";
import { collecting, failureLineFrom, type Report, resultLine } from "../shared/report.ts";
import { runCodeCheck } from "./code-check.ts";
import { applyRules } from "./spec-check/apply-rules.ts";
import { runTypeCheck } from "./type-check.ts";

/** How a check settled: what it answered, or what it threw. */
type Settled<T> = { readonly value: T } | { readonly thrown: unknown };

async function settle<T>(check: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { value: await check() };
  } catch (thrown) {
    return { thrown };
  }
}

/**
 * CheckWorld R3: a TypeCheck finding names its node only when the load succeeded and its file defines exactly one
 * node, an orphan counted too, by the node's path from the world.
 */
function nameTypeFindings(findings: readonly Finding[], world: LoadedWorld | undefined): Finding[] {
  if (!world) return [...findings];
  const defined = new Map<string, (string | undefined)[]>();
  const define = (file: string, path: string | undefined) => defined.set(file, [...(defined.get(file) ?? []), path]);
  for (const node of world.nodes) define(node.file, node.path);
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
 * error. Answers TypeCheck's findings, then SpecCheck's, then CodeCheck's, one result line each, and one failure
 * line per failure, in the order they happen, then one summary line, Diagnostics' summarize (R7); the
 * outcome is ok without errors (warnings allowed), else failed. Without a world there is nothing to sum up: the one
 * failure line alone. Programming errors propagate as a CutShort carrying the lines added before them, and crash with their stack.
 */
export async function runCheck(root: string): Promise<Report> {
  // A bug crashes with its stack, after Cli prints the lines added before it.
  return collecting(async (lines) => {
    const reported: Finding[] = [];
    const addFindings = (findings: readonly Finding[]) => {
      reported.push(...findings);
      lines.push(...format(findings).map(resultLine));
    };
    // An expected failure becomes one failure line; a bug is rethrown.
    const addFailure = (thrown: unknown) => {
      lines.push(failureLineFrom(thrown));
    };
    /** The Report, its summary line last: what an agent reads to know the check ran and how it ended. */
    const summarized = (outcome: "ok" | "failed"): Report => {
      lines.push(resultLine(summarize(reported, outcome === "failed")));
      return { outcome, lines };
    };
    const failedReport = (): Report => summarized("failed");

    const loaded = await settle(() => loadWorld(root));
    // No world: TypeCheck would only fail again for the same reason, so the one line is LoadWorld's.
    if ("thrown" in loaded && loaded.thrown instanceof NoWorldError) {
      addFailure(loaded.thrown);
      return { outcome: "failed", lines };
    }
    const typing = settle(() => runTypeCheck(root));
    /** TypeCheck's findings, named by the loaded world when there is one; its failure after them. */
    const addTypeFindings = (typed: Settled<Finding[]>, world: LoadedWorld | undefined): Finding[] => {
      const findings = "value" in typed ? nameTypeFindings(typed.value, world) : [];
      addFindings(findings);
      if ("thrown" in typed) addFailure(typed.thrown);
      return findings;
    };

    // A broken world still gets every tsc finding, which say most about why it does not load. A world file the
    // loader cannot read is one more finding among them, in their order (R6); any other load failure follows them.
    if ("thrown" in loaded) {
      const unread = loaded.thrown;
      if (!(unread instanceof LoadError)) {
        addTypeFindings(await typing, undefined);
        addFailure(unread);
        return failedReport();
      }
      const typed = await typing;
      // R6: the load error is one more finding beside tsc's, which may name the same break in other words; only a
      // finding of tsc's with the very same file, line and words (a syntax error, which both report) stands for it.
      const typeFindings = "value" in typed ? typed.value : [];
      const loadFinding: Finding = {
        severity: "error",
        ...locate({ file: unread.file, line: unread.line }),
        rule: unread.rule,
      };
      const said = typeFindings.some(
        (finding) =>
          finding.file === loadFinding.file && finding.line === loadFinding.line && finding.rule === loadFinding.rule,
      );
      addFindings(said ? typeFindings : [...typeFindings, loadFinding]);
      if ("thrown" in typed) addFailure(typed.thrown);
      return failedReport();
    }
    const world = loaded.value;
    const typed = await typing;
    const typeFindings = addTypeFindings(typed, world);
    // After a type error SpecCheck leaves out R5: it re-checks tsc's rules, so it would report the same break twice.
    const typeErrors = new Set(typeFindings.flatMap((finding) => (finding.severity === "error" ? [finding.file] : [])));
    const specced = await settle(async () => applyRules(root, world, typeErrors));
    if ("thrown" in specced) {
      addFailure(specced.thrown);
      return failedReport();
    }
    const specFindings = specced.value;
    addFindings(specFindings);
    const errors = [...typeFindings, ...specFindings].some((finding) => finding.severity === "error");
    if ("thrown" in typed || errors) return failedReport();

    const codeFindings = runCodeCheck(world);
    addFindings(codeFindings);
    return summarized(codeFindings.some((finding) => finding.severity === "error") ? "failed" : "ok");
  });
}
