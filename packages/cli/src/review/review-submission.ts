import { readFileSync } from "node:fs";
import { type Finding, format, summarize } from "../shared/diagnostics.ts";
import { inWords } from "../shared/failure.ts";
import { failureLine, orFailed, type Report, resultLine } from "../shared/report.ts";
import { type Scope, scopeAt } from "./review-scope.ts";
import { find } from "./spec-items.ts";

/** A verdict on the code, as the prompt names it. */
type Category = "against-spec" | "possibly-against-spec" | "unspecified";

const CATEGORIES: readonly Category[] = ["against-spec", "possibly-against-spec", "unspecified"];

/** One finding as submitted, its shape judged. */
interface SubmittedFinding {
  readonly category: Category;
  readonly specItem?: string;
  readonly file: string;
  readonly line: number;
  readonly evidence: string;
}

/** A review as submitted, its shape judged (R1); keys it does not take are ignored. */
interface Submission {
  readonly node: string;
  readonly findings: readonly SubmittedFinding[];
}

const REVIEW_SHAPE = '{ "node": "<path>", "findings": [ … ] }';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What a problem says of a field's value: `is missing`, or `is` and the value in words. */
function described(value: unknown): string {
  return value === undefined ? "is missing" : `is ${inWords(value)}`;
}

/** One finding's shape (R1): the finding, or every problem with it. */
function judgeFinding(value: unknown, where: string): SubmittedFinding | string[] {
  if (!isRecord(value)) {
    return [
      `${where} is ${inWords(value)}, not an object; send { "category": …, "file": …, "line": …, "evidence": … }`,
    ];
  }
  const problems: string[] = [];
  const { category, specItem, file, line, evidence } = value;
  const known = CATEGORIES.find((name) => name === category);
  if (known === undefined) {
    problems.push(`${where}.category ${described(category)}; send against-spec, possibly-against-spec or unspecified`);
  }
  if (known !== undefined && (known === "unspecified" ? specItem !== undefined : typeof specItem !== "string")) {
    problems.push(
      `${where}.specItem ${described(specItem)}; an against-spec or possibly-against-spec finding cites the spec item it goes against by its reference, e.g. "requirements[R1]", an unspecified one none`,
    );
  }
  if (typeof file !== "string" || file === "") {
    problems.push(`${where}.file ${described(file)}; send the file the finding is in, as the prompt lists it`);
  }
  if (typeof line !== "number" || !Number.isInteger(line) || line < 1) {
    problems.push(`${where}.line ${described(line)}; send the line as a whole number from 1`);
  }
  if (typeof evidence !== "string" || evidence.trim() === "") {
    const got = typeof evidence === "string" ? "is blank" : described(evidence);
    problems.push(`${where}.evidence ${got}; say what the code does and why it goes against the spec`);
  }
  if (problems.length > 0) return problems;
  return {
    category: known as Category,
    ...(typeof specItem === "string" ? { specItem } : {}),
    file: file as string,
    line: line as number,
    evidence: evidence as string,
  };
}

/** The review's shape (R1): the submission, or every problem with it. */
function judgeShape(value: unknown): Submission | string[] {
  if (!isRecord(value)) return [`the review is ${inWords(value)}, not a JSON object; send ${REVIEW_SHAPE}`];
  const problems: string[] = [];
  const { node, findings } = value;
  if (typeof node !== "string" || node === "") {
    problems.push(`node ${described(node)}; send the reviewed node's path, as the prompt names it`);
  }
  const judged: SubmittedFinding[] = [];
  if (!Array.isArray(findings)) {
    problems.push(`findings ${described(findings)}; send a list of findings, [] when the code passes`);
  } else {
    for (const [index, finding] of findings.entries()) {
      const result = judgeFinding(finding, `findings[${index}]`);
      if (Array.isArray(result)) problems.push(...result);
      else judged.push(result);
    }
  }
  if (problems.length > 0) return problems;
  return { node: node as string, findings: judged };
}

/** How many lines a file has: a last line ending in a newline opens none. */
function lineCount(file: string): number {
  const text = readFileSync(file, "utf8");
  return text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

/** How many files a message names before it counts the rest. */
const NAMED_FILES = 5;

/** The first files, then how many more: "a.ts, b.ts and 3 more (the prompt lists them all)". */
function someOf(files: readonly string[]): string {
  if (files.length <= NAMED_FILES) return files.join(", ");
  const more = files.length - NAMED_FILES;
  return `${files.slice(0, NAMED_FILES).join(", ")} and ${more} more (the prompt lists them all)`;
}

/**
 * The submission's content against its scope (R2): each spec item one the scope lists, each file one of its files or
 * an item's spec file and each line within it. Every problem.
 */
function judgeContent(submission: Submission, scope: Scope): string[] {
  const problems: string[] = [];
  const specFiles = [...new Set(scope.items.map((item) => item.file))];
  const citable = new Set([...scope.files, ...specFiles]);
  const lines = new Map<string, number>();
  for (const [index, finding] of submission.findings.entries()) {
    const where = `findings[${index}]`;
    if (finding.specItem !== undefined && find(scope.items, finding.specItem) === undefined) {
      problems.push(
        `${where}.specItem ${JSON.stringify(finding.specItem)} is no item of ${scope.node}'s spec; cite a reference as the prompt lists it, e.g. ${JSON.stringify(scope.example)}`,
      );
    }
    if (!citable.has(finding.file)) {
      problems.push(
        `${where}.file ${JSON.stringify(finding.file)} is not a file of ${scope.node}'s review; cite one of ${someOf([...scope.files, ...specFiles])}, as printed`,
      );
      continue;
    }
    const count = lines.get(finding.file) ?? lineCount(finding.file);
    lines.set(finding.file, count);
    if (finding.line > count) {
      problems.push(
        `${where}.line ${finding.line} is past the end of ${finding.file}, which has ${count} line${count === 1 ? "" : "s"}; cite a line within it`,
      );
    }
  }
  return problems;
}

/** The invalid Report: one failure line per problem, no finding line (R3). */
function invalid(problems: readonly string[]): Report {
  return { outcome: "invalid", lines: problems.map(failureLine) };
}

/** A submitted finding as a finding check would print (R4): against-spec an error, the others warnings. */
function findingOf(scope: Scope, finding: SubmittedFinding): Finding {
  return {
    severity: finding.category === "against-spec" ? "error" : "warning",
    file: finding.file,
    line: finding.line,
    node: scope.node,
    rule: finding.specItem ?? "unspecified",
    fix: finding.evidence,
  };
}

/**
 * The program behind `review --submit`: parse, judge the shape, load, find the node, its scope, judge the content
 * (R2). Answers the review `text` submitted for the project directory `root`, named from the cwd: ok or failed with
 * one finding line each, in Diagnostics' order, then the summary (R4); invalid with one failure line per problem
 * (R3); failed with one failure line when no world loads. Programming errors propagate and crash with their stack.
 */
export function runReviewSubmission(root: string, text: string): Promise<Report> {
  return orFailed(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return invalid([`the review is not JSON (${why}); send one JSON object, ${REVIEW_SHAPE}`]);
    }
    const submission = judgeShape(parsed);
    if (Array.isArray(submission)) return invalid(submission);
    const scope = await scopeAt(root, submission.node);
    if ("outcome" in scope) return scope;
    const problems = judgeContent(submission, scope);
    if (problems.length > 0) return invalid(problems);
    const findings = submission.findings.map((finding) => findingOf(scope, finding));
    const outcome = findings.some((finding) => finding.severity === "error") ? "failed" : "ok";
    return { outcome, lines: [...format(findings), summarize(findings)].map(resultLine) };
  });
}
