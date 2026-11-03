import { expect, test } from "bun:test";
import { asksHelp, leftovers, noArguments } from "./cmd.ts";
import { DEFAULT_LEVEL, LEVEL_OPTION, treeCmd } from "./commands/tree.ts";

test("noArguments: nothing left is no error; an option or a positional is named", () => {
  expect(noArguments([])).toBeUndefined();
  expect(noArguments(["--force"])).toEqual({ error: "unknown option '--force'" });
  expect(noArguments(["-L", "1"])).toEqual({ error: "unknown option '-L'" });
  expect(noArguments(["x"])).toEqual({ error: "unexpected argument 'x'" });
  expect(noArguments(["x", "--force"])).toEqual({ error: "unknown option '--force'" });
  // A help flag that is not the whole request is an argument, not an option.
  expect(noArguments(["--help", "junk"])).toEqual({ error: "unexpected argument '--help'" });
});

test("leftovers: up to max positionals pass; the first extra is named", () => {
  expect(leftovers(["a"], 1)).toBeUndefined();
  expect(leftovers(["a", "b", "c"], 1)).toEqual({ error: "unexpected argument 'b'" });
});

test("asksHelp: one help flag once the options are split off, whatever their values", () => {
  expect(asksHelp(["--help"], [])).toBe(true);
  expect(asksHelp(["-h"], [LEVEL_OPTION])).toBe(true);
  expect(asksHelp(["-L", "x", "--help"], [LEVEL_OPTION])).toBe(true);
  expect(asksHelp(["--help", "junk"], [])).toBe(false);
  expect(asksHelp(["-L", "--help"], [LEVEL_OPTION])).toBe(false);
  expect(asksHelp(["help"], [])).toBe(false);
});

test("tree's parse: no node and the default level unless given", () => {
  expect(treeCmd.parse([])).toEqual({ node: undefined, level: DEFAULT_LEVEL });
  expect(DEFAULT_LEVEL).toBe(1);
  expect(treeCmd.parse(["Check"])).toEqual({ node: "Check", level: 1 });
  expect(treeCmd.parse(["help"])).toEqual({ node: "help", level: 1 });
});

test("tree's parse: -L, --level and --level= take a whole number, anywhere beside the node", () => {
  expect(treeCmd.parse(["-L", "2"])).toEqual({ node: undefined, level: 2 });
  expect(treeCmd.parse(["Check", "--level", "3"])).toEqual({ node: "Check", level: 3 });
  expect(treeCmd.parse(["--level=0", "Check"])).toEqual({ node: "Check", level: 0 });
});

test("tree's parse: a missing, repeated or non-whole level is a usage error naming the spelling typed", () => {
  expect(treeCmd.parse(["-L"])).toEqual({ error: "-L needs a whole number" });
  expect(treeCmd.parse(["--level="])).toEqual({ error: "--level needs a whole number" });
  expect(treeCmd.parse(["-L", "--help"])).toEqual({ error: "-L needs a whole number" });
  expect(treeCmd.parse(["-L", "x"])).toEqual({ error: "-L needs a whole number, got 'x'" });
  expect(treeCmd.parse(["-L", "-1"])).toEqual({ error: "-L needs a whole number, got '-1'" });
  expect(treeCmd.parse(["--level=1.5"])).toEqual({ error: "--level needs a whole number, got '1.5'" });
  expect(treeCmd.parse(["-L", "1", "--level", "2"])).toEqual({ error: "--level given twice" });
});

test("tree's parse: one node at most, and no option but its own", () => {
  expect(treeCmd.parse(["a", "b", "c"])).toEqual({ error: "unexpected argument 'b'" });
  expect(treeCmd.parse(["--depth", "2"])).toEqual({ error: "unknown option '--depth'" });
  expect(treeCmd.parse(["--path", "x"])).toEqual({ error: "unknown option '--path'" });
});
