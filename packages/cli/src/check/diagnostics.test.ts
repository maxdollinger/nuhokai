import { expect, test } from "bun:test";
import { formatFinding } from "./diagnostics.ts";

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

test("a missing line drops only its part", () => {
  expect(
    formatFinding({ severity: "error", file: "nuhokai/index.ts", rule: "the world has no name", fix: "add one" }),
  ).toBe("error: nuhokai/index.ts: the world has no name; add one");
});
