import { expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMANDS, commandUsage, main, usage } from "./bin.ts";
import { runInit } from "./init/index.ts";
import type { Report } from "./shared/report.ts";
import * as printTree from "./tree/print-tree.ts";

/** What a stubbed Tree answers: done, nothing to print. */
const TREE_OK: Report = { outcome: "ok", lines: [] };

/** Run main with console.log captured: its exit code and the lines it logged. */
async function logged(argv: string[]): Promise<[number, string[]]> {
  const lines: string[] = [];
  const log = console.log;
  console.log = (line: string) => lines.push(line);
  try {
    return [await main(argv), lines];
  } finally {
    console.log = log;
  }
}

test("usage lists every command", () => {
  for (const command of COMMANDS) expect(usage()).toContain(command);
});

test("--help exits 0", async () => {
  expect(await logged(["--help"])).toEqual([0, [usage()]]);
});

test("no argument prints usage on stdout and exits 0", async () => {
  expect(await logged([])).toEqual([0, [usage()]]);
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
  expect(await logged(["init", "--help"])).toEqual([0, [commandUsage("init")]]);
  expect(commandUsage("init")).toContain("Usage: nuhokai init");
});

test("Cli enforces the argument count without validating the argument", async () => {
  expect(await main(["init", "extra"])).toBe(2);
});

test("an unknown command is a usage error", async () => {
  expect(await main(["bogus"])).toBe(2);
});

test("`nuhokai map --help` shows that map takes no argument", async () => {
  expect(await logged(["map", "--help"])).toEqual([0, [commandUsage("map")]]);
  expect(commandUsage("map")).toContain("Usage: nuhokai map\n");
});

test("`nuhokai map` runs WorldMap with the cwd; `nuhokai map x` is an argument error and WorldMap never runs", async () => {
  const repo = mkdtempSync(join(tmpdir(), "nuhokai-bin-map-test-"));
  const cwd = process.cwd();
  const log = console.log;
  const error = console.error;
  const out: string[] = [];
  try {
    expect((await runInit(repo)).outcome).toBe("ok");
    console.log = (line: string) => out.push(line);
    console.error = () => {};
    process.chdir(repo);

    expect(await main(["map", "x"])).toBe(2);
    expect(existsSync(join(repo, "nuhokai/.generated/map.html"))).toBe(false);
    expect(await main(["map"])).toBe(0);
  } finally {
    process.chdir(cwd);
    console.log = log;
    console.error = error;
    rmSync(repo, { recursive: true, force: true });
  }
  expect(out).toEqual(["nuhokai/.generated/map.html"]);
});

test("--path names the project directory, against the cwd; without it the cwd is the directory", async () => {
  const parent = mkdtempSync(join(tmpdir(), "nuhokai-bin-path-test-"));
  const project = join(parent, "packages", "app");
  mkdirSync(project, { recursive: true });
  const cwd = process.cwd();
  const log = console.log;
  const error = console.error;
  const out: string[] = [];
  const err: string[] = [];
  try {
    console.log = (line: string) => out.push(line);
    console.error = (line: string) => err.push(line);
    process.chdir(parent);

    expect(await main(["map"])).toBe(1);
    expect(err[0]).toBe(
      "nuhokai map: no nuhokai/ here; run `nuhokai init` to start a world here, or pass --path <project dir>",
    );
    expect(await main(["init", "--path", "packages/app"])).toBe(0);
    expect(existsSync(join(project, "nuhokai/index.ts"))).toBe(true);
    expect(existsSync(join(parent, "nuhokai"))).toBe(false);
    expect(await main(["map", "--path=packages/app"])).toBe(0);
    expect(existsSync(join(project, "nuhokai/.generated/map.html"))).toBe(true);
    // Printed paths are named from the cwd, so they can be opened as printed.
    expect(out).toContain("packages/app/nuhokai/index.ts");
    expect(out.at(-1)).toBe("packages/app/nuhokai/.generated/map.html");
    // So are the paths in failures, the loader's included.
    writeFileSync(join(project, "nuhokai/orders.ts"), "export const boom = ;\n");
    expect(await main(["map", "--path", "packages/app"])).toBe(1);
    expect(err.at(-1)).toBe("nuhokai map: packages/app/nuhokai/orders.ts:1: Expression expected.");
    expect(await main(["map", "--path", "packages"])).toBe(1);
    expect(err.at(-1)).toBe(
      "nuhokai map: no nuhokai/ in packages; run `nuhokai init --path packages` to start a world there",
    );
  } finally {
    process.chdir(cwd);
    console.log = log;
    console.error = error;
    rmSync(parent, { recursive: true, force: true });
  }
});

test("a --path without a value, given twice or not a directory is a usage error and nothing runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-bin-path-test-"));
  const file = join(dir, "file");
  writeFileSync(file, "");
  const error = console.error;
  const err: string[] = [];
  try {
    console.error = (line: string) => err.push(line);
    expect(await main(["init", "--path"])).toBe(2);
    expect(await main(["init", "--path", dir, "--path", dir])).toBe(2);
    expect(await main(["init", "--path", join(dir, "missing")])).toBe(2);
    expect(await main(["init", "--path", file])).toBe(2);
    expect(await main(["map", `--path=${file}/x`])).toBe(2);
    expect(await main(["tree", "a", "--path"])).toBe(2);
    expect(await main(["map", "--path", "--help"])).toBe(2);
  } finally {
    console.error = error;
  }
  expect(err.map((line) => line.split("\n")[0])).toEqual([
    "nuhokai init: --path needs a directory",
    "nuhokai init: --path given twice",
    `nuhokai init: not a directory: ${join(dir, "missing")}`,
    `nuhokai init: not a directory: ${file}`,
    `nuhokai map: not a directory: ${file}/x`,
    "nuhokai tree: --path needs a directory",
    "nuhokai map: --path needs a directory",
  ]);
  expect(readdirSync(dir)).toEqual(["file"]);
  rmSync(dir, { recursive: true, force: true });
});

test("a help word next to --path prints the command's help, whatever the path", async () => {
  expect(await logged(["map", "--path", "x", "--help"])).toEqual([0, [commandUsage("map")]]);
  expect(await logged(["map", "--path=x", "-h"])).toEqual([0, [commandUsage("map")]]);
});

/** Run main with console.error captured: its exit code and the first line of each message. */
async function failed(argv: string[]): Promise<[number, string[]]> {
  const lines: string[] = [];
  const error = console.error;
  console.error = (line: string) => lines.push(line);
  try {
    return [await main(argv), lines.map((line) => line.split("\n")[0] ?? "")];
  } finally {
    console.error = error;
  }
}

test("before a command `help` is help; after one only -h and --help are", async () => {
  expect(await logged(["help"])).toEqual([0, [usage()]]);
  expect(await logged(["tree", "-h"])).toEqual([0, [commandUsage("tree")]]);
  expect(await failed(["map", "help"])).toEqual([2, ["nuhokai map: unexpected argument 'help'"]]);

  const run = spyOn(printTree, "runTree").mockResolvedValue(TREE_OK);
  try {
    expect(await main(["tree", "help"])).toBe(0);
    expect(run.mock.calls).toEqual([[".", "help", 1]]);
  } finally {
    run.mockRestore();
  }
});

test("an unknown option or an extra argument is named, exit 2, nothing runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-bin-args-test-"));
  try {
    expect(await failed(["map", "--pth", dir])).toEqual([2, ["nuhokai map: unknown option '--pth'"]]);
    expect(await failed(["init", "--force", "--path", dir])).toEqual([2, ["nuhokai init: unknown option '--force'"]]);
    expect(await failed(["tree", "a", "b", "c", "--path", dir])).toEqual([
      2,
      ["nuhokai tree: unexpected argument 'b'"],
    ]);
    expect(await failed(["init", "x", "--path", dir])).toEqual([2, ["nuhokai init: unexpected argument 'x'"]]);
    expect(readdirSync(dir)).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("`nuhokai check --help` shows that check takes no argument", async () => {
  expect(await logged(["check", "--help"])).toEqual([0, [commandUsage("check")]]);
  expect(await logged(["check", "--path", "x", "-h"])).toEqual([0, [commandUsage("check")]]);
  expect(commandUsage("check")).toContain("Usage: nuhokai check\n");
  expect(usage()).toContain("nuhokai check");
});

test("`nuhokai check` runs Check in the cwd or under --path; `nuhokai check x` is an argument error and Check never runs", async () => {
  const parent = mkdtempSync(join(tmpdir(), "nuhokai-bin-check-test-"));
  const project = join(parent, "app");
  mkdirSync(project);
  const cwd = process.cwd();
  const log = console.log;
  const error = console.error;
  const out: string[] = [];
  const err: string[] = [];
  try {
    expect((await runInit(project)).outcome).toBe("ok");
    console.log = (line: string) => out.push(line);
    console.error = (line: string) => err.push(line);
    process.chdir(parent);

    expect(await main(["check", "x", "--path", "app"])).toBe(2);
    expect(err.at(-1)?.split("\n")[0]).toBe("nuhokai check: unexpected argument 'x'");
    expect(await main(["check", "--pth", "app"])).toBe(2);
    expect(err.at(-1)?.split("\n")[0]).toBe("nuhokai check: unknown option '--pth'");
    // Check itself would name the missing world; an argument error never gets that far.
    expect(err.some((line) => line.includes("no nuhokai/"))).toBe(false);

    expect(await main(["check"])).toBe(1);
    expect(err.at(-1)).toBe(
      "nuhokai check: no nuhokai/ here; run `nuhokai init` to start a world here, or pass --path <project dir>",
    );
    expect(await main(["check", "--path=app"])).toBe(0);
    expect(out).toEqual([]);
    // Findings name their files from the cwd.
    writeFileSync(
      join(project, "nuhokai/orphan.ts"),
      'import { node } from "@nuhokai/world";\n\nexport const Orphan = node({ id: "o", purpose: "p", status: "planned", source: [] }).edges({});\n',
    );
    process.chdir(project);
    expect(await main(["check"])).toBe(0);
    expect(out).toEqual([
      "warning: nuhokai/orphan.ts: Orphan: Orphan is exported but not reachable from the world; list it in a dome's children or in the world's (nuhokai/index.ts), or delete it",
    ]);
  } finally {
    process.chdir(cwd);
    console.log = log;
    console.error = error;
    rmSync(parent, { recursive: true, force: true });
  }
});

test("`nuhokai tree --help` lists --level; usage shows tree's argument form", async () => {
  expect(await logged(["tree", "--help"])).toEqual([0, [commandUsage("tree")]]);
  expect(await logged(["tree", "-L", "2", "-h"])).toEqual([0, [commandUsage("tree")]]);
  // A bad value is judged after help, as a bad --path is.
  expect(await logged(["tree", "-L", "x", "--help"])).toEqual([0, [commandUsage("tree")]]);
  expect(await logged(["tree", "--path", "nope", "--help"])).toEqual([0, [commandUsage("tree")]]);
  expect(commandUsage("tree")).toContain("Usage: nuhokai tree [node] [-L <n>]");
  expect(commandUsage("tree")).toContain("-L, --level <n>");
  expect(commandUsage("map")).not.toContain("--level");
  expect(usage()).toContain("nuhokai tree [node] [-L <n>]");
});

test("Cli R6, R8: tree gets the directory, the node or none, and the level as a number", async () => {
  const run = spyOn(printTree, "runTree").mockResolvedValue(TREE_OK);
  try {
    expect(await main(["tree"])).toBe(0);
    expect(await main(["tree", "Check", "-L", "2"])).toBe(0);
    expect(await main(["tree", "--level=0", "Check"])).toBe(0);
    expect(await main(["tree", "--level", "3"])).toBe(0);
    expect(run.mock.calls).toEqual([
      [".", undefined, 1],
      [".", "Check", 2],
      [".", "Check", 0],
      [".", undefined, 3],
    ]);
  } finally {
    run.mockRestore();
  }
});

test("Cli R6, R8: a bad --level, a second one, two nodes or -L on another command → exit 2, nothing runs", async () => {
  const run = spyOn(printTree, "runTree").mockResolvedValue(TREE_OK);
  try {
    expect(await failed(["tree", "-L"])).toEqual([2, ["nuhokai tree: -L needs a whole number"]]);
    expect(await failed(["tree", "--level="])).toEqual([2, ["nuhokai tree: --level needs a whole number"]]);
    expect(await failed(["tree", "-L", "--help"])).toEqual([2, ["nuhokai tree: -L needs a whole number"]]);
    expect(await failed(["tree", "-L", "x"])).toEqual([2, ["nuhokai tree: -L needs a whole number, got 'x'"]]);
    expect(await failed(["tree", "-L", "-1"])).toEqual([2, ["nuhokai tree: -L needs a whole number, got '-1'"]]);
    expect(await failed(["tree", "--level=1.5"])).toEqual([
      2,
      ["nuhokai tree: --level needs a whole number, got '1.5'"],
    ]);
    expect(await failed(["tree", "-L", "1", "--level", "2"])).toEqual([2, ["nuhokai tree: --level given twice"]]);
    expect(await failed(["tree", "-L", "1", "-L", "2"])).toEqual([2, ["nuhokai tree: -L given twice"]]);
    expect(await failed(["tree", "a", "b"])).toEqual([2, ["nuhokai tree: unexpected argument 'b'"]]);
    expect(await failed(["tree", "--depth", "2"])).toEqual([2, ["nuhokai tree: unknown option '--depth'"]]);
    expect(await failed(["map", "-L", "1"])).toEqual([2, ["nuhokai map: unknown option '-L'"]]);
    expect(run).not.toHaveBeenCalled();
  } finally {
    run.mockRestore();
  }
});

/** Run main with console.log and console.error captured: its exit code and what reached stdout and stderr. */
async function printed(argv: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (line: string) => out.push(line);
  console.error = (line: string) => err.push(line);
  try {
    return { code: await main(argv), out, err };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test("Cli R9: a command's result lines reach stdout in order, its failure lines stderr after Cli's prefix", async () => {
  const run = spyOn(printTree, "runTree").mockResolvedValue({
    outcome: "failed",
    lines: [
      { kind: "result", text: "a" },
      { kind: "failure", text: "x" },
      { kind: "result", text: "b" },
    ],
  });
  try {
    expect(await printed(["tree"])).toEqual({ code: 1, out: ["a", "b"], err: ["nuhokai tree: x"] });
  } finally {
    run.mockRestore();
  }
});

test("Cli R2, R9: Cli maps the outcome to the exit code: ok 0, failed 1, invalid 2", async () => {
  const run = spyOn(printTree, "runTree");
  try {
    run.mockResolvedValue({ outcome: "ok", lines: [{ kind: "result", text: "Shop | (none) | p" }] });
    expect(await printed(["tree"])).toEqual({ code: 0, out: ["Shop | (none) | p"], err: [] });
    run.mockResolvedValue({ outcome: "failed", lines: [] });
    expect(await printed(["tree"])).toEqual({ code: 1, out: [], err: [] });
    run.mockResolvedValue({ outcome: "invalid", lines: [{ kind: "failure", text: "x" }] });
    expect(await printed(["tree", "x"])).toEqual({ code: 2, out: [], err: ["nuhokai tree: x"] });
  } finally {
    run.mockRestore();
  }
});
