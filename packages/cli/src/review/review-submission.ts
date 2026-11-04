import { readFileSync } from "node:fs";
import { loadWorld } from "../load/load-world.ts";
import { compareFindings, type Finding, formatFinding, summarize } from "../shared/diagnostics.ts";
import { CliError, errorLine } from "../shared/failure.ts";
import { findNode } from "../shared/node-path.ts";
import { failureLine, orFailed, type Report, resultLine } from "../shared/report.ts";
import { reviewScope, type Scope } from "./review-scope.ts";
import { findItem } from "./spec-items.ts";

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

/** A review as submitted, its shape judged (R1). */
interface Submission {
  readonly node: string;
  readonly reviewedFiles: readonly string[];
  readonly findings: readonly SubmittedFinding[];
}

const REVIEW_KEYS = ["node", "reviewedFiles", "findings"];
const FINDING_KEYS = ["category", "specItem", "file", "line", "evidence"];
const REVIEW_SHAPE = '{ "node": "<path>", "reviewedFiles": ["<file>", …], "findings": [ … ] }';

/** A JSON value in words, for a message: `"x"`, `a list`, `an object`, `null`. */
function inWords(value: unknown): string {
  if (Array.isArray(value)) return "a list";
  if (value === null) return "null";
  if (typeof value === "object") return "an object";
  return JSON.stringify(value) ?? String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The keys of `record` that are not `allowed`, each a problem naming where it is. */
function strayKeys(record: Record<string, unknown>, allowed: readonly string[], where: string, send: string): string[] {
  return Object.keys(record)
    .filter((key) => !allowed.includes(key))
    .map((key) => `${where} has the key ${JSON.stringify(key)}, which a review does not take; send only ${send}`);
}

/** One finding's shape (R1): the finding, or every problem with it. */
function judgeFinding(value: unknown, where: string): SubmittedFinding | string[] {
  if (!isRecord(value)) {
    return [
      `${where} is ${inWords(value)}, not an object; send { "category": …, "file": …, "line": …, "evidence": … }`,
    ];
  }
  const problems = strayKeys(value, FINDING_KEYS, where, "category, specItem, file, line and evidence");
  const { category, specItem, file, line, evidence } = value;
  const known = CATEGORIES.find((name) => name === category);
  if (known === undefined) {
    const got = category === undefined ? "is missing" : `is ${inWords(category)}`;
    problems.push(`${where}.category ${got}; send against-spec, possibly-against-spec or unspecified`);
  }
  if (known === "unspecified" && specItem !== undefined) {
    problems.push(
      `${where}.specItem is given, but an unspecified finding cites no spec item; drop specItem, or make the category against-spec or possibly-against-spec`,
    );
  } else if (known !== undefined && known !== "unspecified" && typeof specItem !== "string") {
    const got = specItem === undefined ? "is missing" : `is ${inWords(specItem)}`;
    problems.push(
      `${where}.specItem ${got}; a ${known} finding cites the spec item it goes against by its reference, e.g. "requirements[R1]"`,
    );
  } else if (known === undefined && specItem !== undefined && typeof specItem !== "string") {
    problems.push(`${where}.specItem is ${inWords(specItem)}; send a spec item's reference, e.g. "requirements[R1]"`);
  }
  if (typeof file !== "string" || file === "") {
    const got = file === undefined ? "is missing" : `is ${inWords(file)}`;
    problems.push(`${where}.file ${got}; send the file the finding is in, as the prompt lists it`);
  }
  if (typeof line !== "number" || !Number.isInteger(line) || line < 1) {
    const got = line === undefined ? "is missing" : `is ${inWords(line)}`;
    problems.push(`${where}.line ${got}; send the line as a whole number from 1`);
  }
  if (typeof evidence !== "string" || evidence.trim() === "") {
    const got =
      evidence === undefined ? "is missing" : typeof evidence === "string" ? "is blank" : `is ${inWords(evidence)}`;
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
  const problems = strayKeys(value, REVIEW_KEYS, "the review", "node, reviewedFiles and findings");
  const { node, reviewedFiles, findings } = value;
  if (typeof node !== "string" || node === "") {
    const got = node === undefined ? "is missing" : `is ${inWords(node)}`;
    problems.push(`node ${got}; send the reviewed node's path, as the prompt names it`);
  }
  if (!Array.isArray(reviewedFiles)) {
    const got = reviewedFiles === undefined ? "is missing" : `is ${inWords(reviewedFiles)}`;
    problems.push(`reviewedFiles ${got}; send a list of every file you read, as the prompt lists them`);
  } else {
    for (const [index, file] of reviewedFiles.entries()) {
      if (typeof file !== "string") {
        problems.push(`reviewedFiles[${index}] is ${inWords(file)}; send each file's name as the prompt lists it`);
      }
    }
  }
  const judged: SubmittedFinding[] = [];
  if (!Array.isArray(findings)) {
    const got = findings === undefined ? "is missing" : `is ${inWords(findings)}`;
    problems.push(`findings ${got}; send a list of findings, [] when the code passes`);
  } else {
    for (const [index, finding] of findings.entries()) {
      const result = judgeFinding(finding, `findings[${index}]`);
      if (Array.isArray(result)) problems.push(...result);
      else judged.push(result);
    }
  }
  if (problems.length > 0) return problems;
  return { node: node as string, reviewedFiles: reviewedFiles as string[], findings: judged };
}

/** How many lines a file has: a last line ending in a newline opens none. */
function lineCount(file: string): number {
  const text = readFileSync(file, "utf8");
  if (text === "") return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

/**
 * The submission's content against its scope (R2): each spec item one the scope lists, each file one of its files or
 * an item's spec file and each line within it, and reviewedFiles holding every file of the scope. Every problem.
 */
function judgeContent(submission: Submission, scope: Scope): string[] {
  const problems: string[] = [];
  const specFiles = [...new Set(scope.items.map((item) => item.file))];
  const citable = new Set([...scope.files, ...specFiles]);
  const lines = new Map<string, number>();
  const example = scope.items.find((item) => item.kind === "requirement")?.ref ?? "purpose";
  for (const [index, finding] of submission.findings.entries()) {
    const where = `findings[${index}]`;
    if (finding.specItem !== undefined && findItem(scope.items, finding.specItem) === undefined) {
      problems.push(
        `${where}.specItem ${JSON.stringify(finding.specItem)} is no item of ${scope.node}'s spec; cite a reference as the prompt lists it, e.g. ${JSON.stringify(example)}`,
      );
    }
    if (!citable.has(finding.file)) {
      problems.push(
        `${where}.file ${JSON.stringify(finding.file)} is not a file of ${scope.node}'s review; cite one of ${[...scope.files, ...specFiles].join(", ")}, as printed`,
      );
      continue;
    }
    let count = lines.get(finding.file);
    if (count === undefined) {
      count = lineCount(finding.file);
      lines.set(finding.file, count);
    }
    if (finding.line > count) {
      problems.push(
        `${where}.line ${finding.line} is past the end of ${finding.file}, which has ${count} line${count === 1 ? "" : "s"}; cite a line within it`,
      );
    }
  }
  for (const file of scope.files) {
    if (!submission.reviewedFiles.includes(file)) {
      problems.push(`reviewedFiles leaves out ${file}, a file of ${scope.node}; read it, then list it as printed`);
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
    const world = await loadWorld(root);
    let scope: Scope;
    try {
      scope = reviewScope(root, world, findNode(world, submission.node, root));
    } catch (error) {
      // A path naming no node, or a node that is not reviewable: the submission is invalid. A file that cannot be
      // read is a failure like a load failure.
      if (error instanceof CliError) return invalid([errorLine(error)]);
      throw error;
    }
    const problems = judgeContent(submission, scope);
    if (problems.length > 0) return invalid(problems);
    const findings = submission.findings.map((finding) => findingOf(scope, finding)).sort(compareFindings);
    const outcome = findings.some((finding) => finding.severity === "error") ? "failed" : "ok";
    return { outcome, lines: [...findings.map(formatFinding), summarize(findings)].map(resultLine) };
  });
}
