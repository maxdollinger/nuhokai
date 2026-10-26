import { expect, test } from "bun:test";
import { COMMANDS, commandUsage, main, usage } from "./bin.ts";

test("usage lists every command", () => {
  for (const command of COMMANDS) expect(usage()).toContain(command);
});

test("--help exits 0", async () => {
  expect(await main(["--help"])).toBe(0);
});

test("no argument prints usage on stdout and exits 0", async () => {
  const lines: string[] = [];
  const log = console.log;
  console.log = (line: string) => lines.push(line);
  try {
    expect(await main([])).toBe(0);
  } finally {
    console.log = log;
  }
  expect(lines.join("\n")).toBe(usage());
});

test("an empty-string argument is an unknown command on stderr", async () => {
  const lines: string[] = [];
  const error = console.error;
  console.error = (line: string) => lines.push(line);
  try {
    expect(await main([""])).toBe(2);
  } finally {
    console.error = error;
  }
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("unknown command");
});

test("a help word does not excuse an unexpected argument", async () => {
  expect(await main(["init", "--help", "junk"])).toBe(2);
});

test("`nuhokai init --help` prints init's help and exits 0", async () => {
  expect(await main(["init", "--help"])).toBe(0);
  expect(commandUsage("init")).toContain("Usage: nuhokai init");
});

test("`nuhokai new --help` shows that new takes a path", async () => {
  expect(await main(["new", "--help"])).toBe(0);
  expect(commandUsage("new")).toContain("Usage: nuhokai new <path>");
});

test("Cli enforces the argument count without validating the argument", async () => {
  expect(await main(["new"])).toBe(2);
  expect(await main(["new", "a", "b"])).toBe(2);
  expect(await main(["new", "new/StockOrder"])).toBe(1);
  expect(await main(["init", "extra"])).toBe(2);
});

test("an unknown command is a usage error", async () => {
  expect(await main(["bogus"])).toBe(2);
});
