import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CliError, isExpected, oneLine } from "./failure.ts";

test("one line, whatever the thrown value", () => {
  expect(oneLine(new Error("first\nsecond"))).toBe("first second");
  expect(oneLine(new Error("  a\n\nb  \nc "))).toBe("a b c");
  expect(oneLine("thrown string")).toBe("thrown string");
  expect(oneLine({ thrown: "object" })).toBe("[object Object]");
});

test("the line is never empty", () => {
  expect(oneLine(new Error(""))).toBe("unknown error");
  expect(oneLine(new Error("  \n  "))).toBe("unknown error");
  expect(oneLine("")).toBe("unknown error");
});

test("a CliError is a distinct type from a plain Error", () => {
  expect(new CliError("one failure")).toBeInstanceOf(CliError);
  expect(new Error("plain")).not.toBeInstanceOf(CliError);
  expect(oneLine(new CliError("one failure"))).toBe("one failure");
});

test("a command expects its own errors and filesystem failures, nothing else", () => {
  expect(isExpected(new CliError("no world"))).toBe(true);

  let failure: unknown;
  try {
    readFileSync("/definitely/not/here");
  } catch (error) {
    failure = error;
  }
  expect(isExpected(failure)).toBe(true);

  expect(isExpected(new TypeError("bug"))).toBe(false);
  expect(isExpected("thrown string")).toBe(false);
  expect(isExpected({ errno: 13 })).toBe(false);
  expect(isExpected(null)).toBe(false);
  expect(isExpected(undefined)).toBe(false);
});
