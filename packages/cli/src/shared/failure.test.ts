import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CliError, errorLine, isExpected, oneLine } from "./failure.ts";

test("one line, whatever the thrown value", () => {
  expect(errorLine(new Error("first\nsecond"))).toBe("first second");
  expect(errorLine(new Error("  a\n\nb  \nc "))).toBe("a b c");
  expect(errorLine("thrown string")).toBe("thrown string");
  expect(errorLine({ thrown: "object" })).toBe("[object Object]");
});

test("the line is never empty", () => {
  expect(errorLine(new Error(""))).toBe("unknown error");
  expect(errorLine(new Error("  \n  "))).toBe("unknown error");
  expect(errorLine("")).toBe("unknown error");
});

test("a CliError is a distinct type from a plain Error", () => {
  expect(new CliError("one failure")).toBeInstanceOf(CliError);
  expect(new Error("plain")).not.toBeInstanceOf(CliError);
  expect(errorLine(new CliError("one failure"))).toBe("one failure");
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

test("text as one line: each run of whitespace or control characters is one space, trimmed", () => {
  expect(oneLine(" a\n\tb\u001b[31m c\r ")).toBe("a b [31m c");
  expect(oneLine("")).toBe("");
});
