import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../init/scaffold.ts";
import { splitReport } from "../shared/split-report.ts";
import { runReviewPrompt } from "./review-prompt.ts";
import { runReviewSubmission } from "./review-submission.ts";
import { named, ROOT } from "./test-world.ts";

const CODE = named("src/tree/print-tree.ts");
const TEST = named("src/tree/print-tree.test.ts");
const SPEC = named("nuhokai/tree/print-tree.ts");
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** PrintTree's review with these findings. */
function review(findings: unknown[]): string {
  return JSON.stringify({ node: "Tree/PrintTree", findings });
}

/** The Report of submitting `text` for the CLI's own world, as Cli would print it. */
async function submitted(text: string) {
  return splitReport(await runReviewSubmission(ROOT, text));
}

test("R1, R3: not JSON, a finding without evidence, an unspecified finding citing an item → one line each, invalid", async () => {
  const notJson = await submitted("{");
  expect(notJson.outcome).toBe("invalid");
  expect(notJson.out).toEqual([]);
  expect(notJson.err).toHaveLength(1);
  expect(notJson.err[0]).toStartWith("the review is not JSON (");

  expect(
    await submitted(
      review([
        { category: "against-spec", specItem: "requirements[R1]", file: CODE, line: 3 },
        { category: "unspecified", specItem: "requirements[R1]", file: CODE, line: 3, evidence: "x" },
      ]),
    ),
  ).toEqual({
    outcome: "invalid",
    out: [],
    err: [
      "findings[0].evidence is missing; say what the code does and why it goes against the spec",
      'findings[1].specItem is "requirements[R1]"; an against-spec or possibly-against-spec finding cites the spec item it goes against by its reference, e.g. "requirements[R1]", an unspecified one none',
    ],
  });
});

test("R1, R3: every shape problem is its own line: a bad node, category, file, line and evidence", async () => {
  const text = JSON.stringify({
    node: 3,
    findings: [{ category: "bug", file: "", line: 1.5, evidence: " " }, "x"],
  });
  expect((await submitted(text)).err).toEqual([
    "node is 3; send the reviewed node's path, as the prompt names it",
    'findings[0].category is "bug"; send against-spec, possibly-against-spec or unspecified',
    'findings[0].file is ""; send the file the finding is in, as the prompt lists it',
    "findings[0].line is 1.5; send the line as a whole number from 1",
    "findings[0].evidence is blank; say what the code does and why it goes against the spec",
    'findings[1] is "x", not an object; send { "category": …, "file": …, "line": …, "evidence": … }',
  ]);
  expect((await submitted("[]")).err).toEqual([
    'the review is a list, not a JSON object; send { "node": "<path>", "findings": [ … ] }',
  ]);
});

test("R1: keys a review does not take are ignored, an old reviewedFiles among them", async () => {
  const finding = { category: "unspecified", file: CODE, line: 1, evidence: "x", severity: "low", confidence: 1 };
  const text = JSON.stringify({ node: "Tree/PrintTree", reviewedFiles: [CODE], confidence: 1, findings: [finding] });
  expect(await submitted(text)).toEqual({
    outcome: "ok",
    out: [`warning: ${CODE}:1: Tree/PrintTree: unspecified; x`, "ok: 0 errors, 1 warning"],
    err: [],
  });
});

test("R2, R3: an item the spec lacks and a line past the file's end → two lines, invalid", async () => {
  const result = await submitted(
    review([
      { category: "against-spec", specItem: "requirements[R9]", file: CODE, line: 3, evidence: "x" },
      { category: "possibly-against-spec", specItem: "requirements[R1]", file: CODE, line: 999, evidence: "x" },
    ]),
  );
  const lines = readFileSync(CODE, "utf8").trimEnd().split("\n").length;
  expect(result).toEqual({
    outcome: "invalid",
    out: [],
    err: [
      `findings[0].specItem "requirements[R9]" is no item of Tree/PrintTree's spec; cite a reference as the prompt lists it, e.g. "requirements[R1]"`,
      `findings[1].line 999 is past the end of ${CODE}, which has ${lines} lines; cite a line within it`,
    ],
  });
  const elsewhere = await submitted(review([{ category: "unspecified", file: "src/bin.ts", line: 1, evidence: "x" }]));
  expect(elsewhere.err).toEqual([
    `findings[0].file "src/bin.ts" is not a file of Tree/PrintTree's review; cite one of ${TEST}, ${CODE}, ${SPEC}, as printed`,
  ]);
});

test("R2: the node must be one, and reviewable: a typo or a dome is one line, invalid", async () => {
  const typo = await submitted(JSON.stringify({ node: "Tree/PrintTre", findings: [] }));
  expect(typo.outcome).toBe("invalid");
  expect(typo.err).toHaveLength(1);
  expect(typo.err[0]).toContain("did you mean `nuhokai tree Tree/PrintTree");
  const dome = await submitted(JSON.stringify({ node: "Check", findings: [] }));
  expect(dome.outcome).toBe("invalid");
  expect(dome.err[0]).toStartWith("Check is a dome");
});

test("R2, R4: valid findings print as check prints them, in its order, then the summary; an error fails", async () => {
  const r3 =
    readFileSync(SPEC, "utf8")
      .split("\n")
      .findIndex((line) => line.includes('id: "R3"')) + 1;
  expect(
    await submitted(
      review([
        { category: "unspecified", file: CODE, line: 12, evidence: "it sorts nothing" },
        { category: "against-spec", specItem: "requirements[R2]", file: CODE, line: 3, evidence: "no world crashes" },
        { category: "possibly-against-spec", specItem: "requirements[R3]", file: SPEC, line: r3, evidence: "maybe" },
      ]),
    ),
  ).toEqual({
    outcome: "failed",
    out: [
      `warning: ${SPEC}:${r3}: Tree/PrintTree: requirements[R3]; maybe`,
      `error: ${CODE}:3: Tree/PrintTree: requirements[R2]; no world crashes`,
      `warning: ${CODE}:12: Tree/PrintTree: unspecified; it sorts nothing`,
      "failed: 1 error, 2 warnings",
    ],
    err: [],
  });
  expect(await submitted(review([]))).toEqual({ outcome: "ok", out: ["ok: 0 errors, 0 warnings"], err: [] });
});

test("R3: no world is one failure line, failed", async () => {
  const empty = mkdtempSync(join(tmpdir(), "nuhokai-review-submission-"));
  temps.push(empty);
  const none = splitReport(await runReviewSubmission(empty, review([])), empty);
  expect(none.outcome).toBe("failed");
  expect(none.out).toEqual([]);
  expect(none.err).toHaveLength(1);
  expect(none.err[0]).toStartWith("no nuhokai/ in <root>");
});

test("R2, R4: a file whose name holds spaces is cited and printed as the prompt prints it; lines count without a final newline", async () => {
  const root = mkdtempSync(join(tmpdir(), "nuhokai-review-submission-"));
  temps.push(root);
  expect((await runInit(root)).outcome).toBe("ok");
  const spec = join(root, "nuhokai/example.ts");
  writeFileSync(spec, readFileSync(spec, "utf8").replace("source: [],", 'source: ["src/**"],'));
  mkdirSync(join(root, "src/assets"), { recursive: true });
  writeFileSync(join(root, "src/assets/Screen Shot.png"), "one\ntwo");
  const file = `${root}/src/assets/Screen Shot.png`;
  expect(splitReport(await runReviewPrompt(root, "Example")).out).toContain(`- ${file}`);
  const cite = (line: number) =>
    JSON.stringify({
      node: "Example",
      findings: [{ category: "unspecified", file, line, evidence: "x" }],
    });
  expect(splitReport(await runReviewSubmission(root, cite(2))).out[0]).toBe(
    `warning: ${file}:2: Example: unspecified; x`,
  );
  expect(splitReport(await runReviewSubmission(root, cite(3))).err).toEqual([
    `findings[0].line 3 is past the end of ${file}, which has 2 lines; cite a line within it`,
  ]);
});
