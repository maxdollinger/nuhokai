import { expect, spyOn, test } from "bun:test";
import type { Report } from "../../shared/report.ts";
import * as printTree from "../../tree/print-tree.ts";
import type { OptionValue } from "../cmd.ts";
import { DEFAULT_LEVEL, LEVEL_OPTION, treeCmd } from "./tree.ts";

/** What a stubbed Tree answers: done, nothing to print. */
const TREE_OK: Report = { outcome: "ok", lines: [] };

/** tree's parse as Cli calls it: the level as typed, if any, and the positionals left; a runner is run in ".". */
async function parse(positionals: string[], level?: OptionValue): Promise<{ error: string } | unknown[]> {
  const parsed = treeCmd.parse(new Map(level ? [[LEVEL_OPTION, level]] : []), positionals);
  if ("error" in parsed) return parsed;
  const run = spyOn(printTree, "runTree").mockResolvedValue(TREE_OK);
  try {
    await parsed.run(".");
    return run.mock.calls[0] ?? [];
  } finally {
    run.mockRestore();
  }
}

test("tree's parse: no node and the default level unless given", async () => {
  expect(DEFAULT_LEVEL).toBe(1);
  expect(await parse([])).toEqual([".", undefined, DEFAULT_LEVEL]);
  expect(await parse(["Check"])).toEqual([".", "Check", 1]);
  expect(await parse(["help"])).toEqual([".", "help", 1]);
});

test("tree's parse: the level, as typed by any spelling, as a number", async () => {
  expect(await parse([], { spelling: "-L", raw: "2" })).toEqual([".", undefined, 2]);
  expect(await parse(["Check"], { spelling: "--level", raw: "0" })).toEqual([".", "Check", 0]);
});

test("tree's parse: a level that is no whole number is a usage error naming the spelling typed", async () => {
  expect(await parse([], { spelling: "-L", raw: "x" })).toEqual({ error: "-L needs a whole number, got 'x'" });
  expect(await parse([], { spelling: "-L", raw: "-1" })).toEqual({ error: "-L needs a whole number, got '-1'" });
  expect(await parse([], { spelling: "--level", raw: "1.5" })).toEqual({
    error: "--level needs a whole number, got '1.5'",
  });
});

test("tree's parse: one node at most, the first extra named before the level is judged", async () => {
  expect(await parse(["a", "b", "c"])).toEqual({ error: "unexpected argument 'b'" });
  expect(await parse(["a", "b"], { spelling: "-L", raw: "x" })).toEqual({ error: "unexpected argument 'b'" });
});
