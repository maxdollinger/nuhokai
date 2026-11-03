import { expect, spyOn, test } from "bun:test";
import type { Report } from "../../shared/report.ts";
import * as printTree from "../../tree/print-tree.ts";
import type { Args } from "../cmd.ts";
import { DEFAULT_LEVEL, LEVEL_OPTION, treeCmd } from "./tree.ts";

/** What a stubbed Tree answers: done, nothing to print. */
const TREE_OK: Report = { outcome: "ok", lines: [] };

/** tree's run as Cli calls it once the arguments passed, in ".": what it hands Tree. */
async function ranWith(positionals: string[], level?: number): Promise<unknown[]> {
  const args: Args = {
    positionals,
    get: <T>(option: unknown) => (option === LEVEL_OPTION ? (level as T | undefined) : undefined),
  };
  const run = spyOn(printTree, "runTree").mockResolvedValue(TREE_OK);
  try {
    await treeCmd.run(".", args);
    return run.mock.calls[0] ?? [];
  } finally {
    run.mockRestore();
  }
}

test("--level's parse: a whole number, as a number", () => {
  expect(LEVEL_OPTION.parse("0")).toBe(0);
  expect(LEVEL_OPTION.parse("2")).toBe(2);
  expect(LEVEL_OPTION.parse("10")).toBe(10);
});

test("--level's parse: no whole number is none", () => {
  expect(LEVEL_OPTION.parse("x")).toBeUndefined();
  expect(LEVEL_OPTION.parse("-1")).toBeUndefined();
  expect(LEVEL_OPTION.parse("1.5")).toBeUndefined();
});

test("tree's run: no node and the default level unless given", async () => {
  expect(DEFAULT_LEVEL).toBe(1);
  expect(await ranWith([])).toEqual([".", undefined, DEFAULT_LEVEL]);
  expect(await ranWith(["Check"])).toEqual([".", "Check", 1]);
  expect(await ranWith(["help"])).toEqual([".", "help", 1]);
});

test("tree's run: the node and the level as given", async () => {
  expect(await ranWith([], 2)).toEqual([".", undefined, 2]);
  expect(await ranWith(["Check"], 0)).toEqual([".", "Check", 0]);
});
