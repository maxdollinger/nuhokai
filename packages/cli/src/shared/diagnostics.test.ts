import { expect, test } from "bun:test";
import { compareFindings, type Finding, formatFinding, summarize } from "./diagnostics.ts";

test("a multi-line tsc error in a file defining no node is one line, without node or fix", () => {
  expect(
    formatFinding({
      severity: "error",
      file: "nuhokai/x.ts",
      line: 3,
      rule: "Type 'string' is not assignable to type 'number'.\n  The expected type comes from property 'a'.",
    }),
  ).toBe(
    "error: nuhokai/x.ts:3: Type 'string' is not assignable to type 'number'. The expected type comes from property 'a'.",
  );
});

test("every part present: severity, file:line, node, rule and fix", () => {
  expect(
    formatFinding({
      severity: "warning",
      file: "app/nuhokai/orders.ts",
      line: 12,
      node: "Shop/Orders",
      rule: "Orders is not reachable from the world",
      fix: "list it in a dome's children\nor delete it",
    }),
  ).toBe(
    "warning: app/nuhokai/orders.ts:12: Shop/Orders: Orders is not reachable from the world; list it in a dome's children or delete it",
  );
});

test("R2: a line carries no column, also where the finding knows one", () => {
  expect(
    formatFinding({ severity: "error", file: "nuhokai/x.ts", line: 3, column: 14, rule: "Cannot find name 'gone'." }),
  ).toBe("error: nuhokai/x.ts:3: Cannot find name 'gone'.");
  expect(
    formatFinding({ severity: "warning", file: "nuhokai/lost.ts", line: 3, column: 20, node: "Box", rule: "orphan" }),
  ).toBe("warning: nuhokai/lost.ts:3: Box: orphan");
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
  const sorted = [at(2, 1, "b"), at(1, 9, "b"), at(1, 1, "c"), at(1, 5, "a")].sort(compareFindings);
  expect(sorted.map((finding) => `${finding.line}${finding.rule}`)).toEqual(["1a", "1b", "1c", "2b"]);
});

test("a missing line drops only its part", () => {
  expect(
    formatFinding({ severity: "error", file: "nuhokai/index.ts", rule: "the world has no name", fix: "add one" }),
  ).toBe("error: nuhokai/index.ts: the world has no name; add one");
});
