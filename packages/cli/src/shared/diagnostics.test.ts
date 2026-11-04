import { expect, test } from "bun:test";
import { type Finding, format, locate, nodeError, order, summarize } from "./diagnostics.ts";

test("a multi-line tsc error in a file defining no node is one line, without node or fix", () => {
  expect(
    format([
      {
        severity: "error",
        file: "nuhokai/x.ts",
        line: 3,
        rule: "Type 'string' is not assignable to type 'number'.\n  The expected type comes from property 'a'.",
      },
    ]),
  ).toEqual([
    "error: nuhokai/x.ts:3: Type 'string' is not assignable to type 'number'. The expected type comes from property 'a'.",
  ]);
});

test("every part present: severity, file:line, node, rule and fix", () => {
  expect(
    format([
      {
        severity: "warning",
        file: "app/nuhokai/orders.ts",
        line: 12,
        node: "Shop/Orders",
        rule: "Orders is not reachable from the world",
        fix: "list it in a dome's children\nor delete it",
      },
    ]),
  ).toEqual([
    "warning: app/nuhokai/orders.ts:12: Shop/Orders: Orders is not reachable from the world; list it in a dome's children or delete it",
  ]);
});

test("R2: a line carries no column, also where the finding knows one", () => {
  expect(
    format([
      { severity: "error", file: "nuhokai/x.ts", line: 3, column: 14, rule: "Cannot find name 'gone'." },
      { severity: "warning", file: "nuhokai/lost.ts", line: 3, column: 20, node: "Box", rule: "orphan" },
    ]),
  ).toEqual(["warning: nuhokai/lost.ts:3: Box: orphan", "error: nuhokai/x.ts:3: Cannot find name 'gone'."]);
});

test("R3: three type errors on one line are one line ending in (×3); the summary still counts three", () => {
  const error = (column: number): Finding => ({
    severity: "error",
    file: "nuhokai/a.ts",
    line: 2,
    column,
    rule: "Type 'number' is not assignable to type 'string'.",
  });
  const other: Finding = { severity: "error", file: "nuhokai/a.ts", line: 2, rule: "Cannot find name 'x'." };
  const findings = [error(30), other, error(10), error(20)];
  expect(format(findings)).toEqual([
    "error: nuhokai/a.ts:2: Cannot find name 'x'.",
    "error: nuhokai/a.ts:2: Type 'number' is not assignable to type 'string'. (×3)",
  ]);
  expect(summarize(findings)).toBe("failed: 4 errors, 0 warnings");
});

test("summarize: no findings ok; warnings alone ok; any error failed", () => {
  const warning: Finding = { severity: "warning", file: "a.ts", rule: "w" };
  const error: Finding = { severity: "error", file: "a.ts", rule: "e" };
  expect(summarize([])).toBe("ok: 0 errors, 0 warnings");
  expect(summarize([warning])).toBe("ok: 0 errors, 1 warning");
  expect(summarize([error, error])).toBe("failed: 2 errors, 0 warnings");
  expect(summarize([error, warning, warning])).toBe("failed: 1 error, 2 warnings");
  // A run that failed without an error finding still says so.
  expect(summarize([warning], true)).toBe("failed: 0 errors, 1 warning");
});

test("order: file, then line, rule and node; the column never decides", () => {
  const at = (line: number, column: number, rule: string): Finding => ({
    severity: "error",
    file: "a.ts",
    line,
    column,
    rule,
  });
  const sorted = [at(2, 1, "b"), at(1, 9, "b"), at(1, 1, "c"), at(1, 5, "a")].sort(order);
  expect(sorted.map((finding) => `${finding.line}${finding.rule}`)).toEqual(["1a", "1b", "1c", "2b"]);
});

test("a missing line drops only its part; locate and nodeError place a finding at a file and line", () => {
  expect(
    format([
      { severity: "error", ...locate({ file: "nuhokai/index.ts" }), rule: "the world has no name", fix: "add one" },
    ]),
  ).toEqual(["error: nuhokai/index.ts: the world has no name; add one"]);
  expect(locate({ file: "nuhokai/a.ts", line: 3 })).toEqual({ file: "nuhokai/a.ts", line: 3 });
  expect(nodeError({ file: "nuhokai/a.ts", line: 4, path: "Shop/A" }, "r", "f")).toEqual({
    severity: "error",
    file: "nuhokai/a.ts",
    line: 4,
    node: "Shop/A",
    rule: "r",
    fix: "f",
  });
});

test("R4: the file part loses only control characters, so a path with spaces opens as printed", () => {
  const finding: Finding = { severity: "warning", file: "my  app/src/a.ts\u001b[31m", line: 2, rule: "a  rule" };
  expect(format([finding])).toEqual(["warning: my  app/src/a.ts [31m:2: a rule"]);
});
