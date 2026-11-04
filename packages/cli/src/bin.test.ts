import { expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./bin.ts";
import * as specCheck from "./check/spec-check/apply-rules.ts";
import { checkCmd } from "./cli/commands/check.ts";
import { initCmd } from "./cli/commands/init.ts";
import { mapCmd } from "./cli/commands/map.ts";
import { reviewCmd } from "./cli/commands/review.ts";
import { treeCmd } from "./cli/commands/tree.ts";
import { runInit } from "./init/scaffold.ts";
import * as reviewPrompt from "./review/review-prompt.ts";
import * as reviewSubmission from "./review/review-submission.ts";
import { CutShort, failureLine, type Report, resultLine } from "./shared/report.ts";
import * as printTree from "./tree/print-tree.ts";

/** What a stubbed Tree answers: done, nothing to print. */
const TREE_OK: Report = { outcome: "ok", lines: [] };

/** What main printed: its exit code, or the error it threw, and each line it wrote to stdout and to stderr. */
type Printed = { code: number; out: string[]; err: string[] } | { thrown: unknown; out: string[]; err: string[] };

/**
 * Stdin as main reads it: a terminal (undefined), or a pipe that sends `text` (when not empty) after `delayMs` and
 * then closes, unless `open`; main waits 50ms for its first chunk. `reads` counts how often it was read.
 */
function stdinOf(text: string | undefined, { open = false, delayMs = 0 } = {}) {
  const stdin = {
    isTTY: text === undefined,
    waitMs: 50,
    reads: 0,
    stream: () => {
      stdin.reads++;
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          if (delayMs > 0) await Bun.sleep(delayMs);
          if (text) controller.enqueue(new TextEncoder().encode(text));
          if (!open) controller.close();
        },
      });
    },
  };
  return stdin;
}

/** Run main with console.log and console.error captured, the one way these tests read what Cli prints. */
async function printed(argv: string[], stdin: Parameters<typeof main>[1] = stdinOf("")): Promise<Printed> {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (line: string) => out.push(line);
  console.error = (line: string) => err.push(line);
  try {
    return { code: await main(argv, stdin), out, err };
  } catch (thrown) {
    return { thrown, out, err };
  } finally {
    console.log = log;
    console.error = error;
  }
}

/** A command's help as main prints it for `nuhokai <command> --help`. */
async function help(command: string): Promise<string> {
  return (await printed([command, "--help"])).out.join("\n");
}

/** Usage as main prints it for a bare `nuhokai`. */
async function usage(): Promise<string> {
  return (await printed([])).out.join("\n");
}

/** A usage error as printed: main's exit code and the first line of each stderr message, without the usage after it. */
async function failed(argv: string[]): Promise<[number | undefined, string[]]> {
  const result = await printed(argv);
  return ["code" in result ? result.code : undefined, result.err.map((line) => line.split("\n")[0] ?? "")];
}

test("usage lists every command", async () => {
  for (const command of ["check", "init", "map", "review", "tree"]) {
    expect(await usage()).toContain(`nuhokai ${command}`);
  }
});

test("--help exits 0", async () => {
  expect(await printed(["--help"])).toEqual({ code: 0, out: [await usage()], err: [] });
});

test("no argument prints usage on stdout and exits 0", async () => {
  const result = await printed([]);
  expect(result).toMatchObject({ code: 0, err: [] });
  expect(result.out).toHaveLength(1);
  expect(result.out[0]).toStartWith("nuhokai — the world format toolchain");
});

test("an empty-string argument is an unknown command on stderr", async () => {
  expect(await failed([""])).toEqual([2, ["nuhokai: unknown command ''"]]);
});

test("a help word does not excuse an unexpected argument", async () => {
  expect(await main(["init", "--help", "junk"])).toBe(2);
});

test("`nuhokai init --help` prints init's help and exits 0", async () => {
  expect(await printed(["init", "--help"])).toEqual({ code: 0, out: [await help("init")], err: [] });
  expect(await help("init")).toContain("Usage: nuhokai init");
});

test("Cli enforces the argument count without validating the argument", async () => {
  expect(await main(["init", "extra"])).toBe(2);
});

test("an unknown command is a usage error", async () => {
  expect(await main(["bogus"])).toBe(2);
});

test("`nuhokai map --help` shows that map takes no argument", async () => {
  expect(await printed(["map", "--help"])).toEqual({ code: 0, out: [await help("map")], err: [] });
  expect(await help("map")).toContain("Usage: nuhokai map\n");
});

test("`nuhokai map` runs WorldMap with the cwd; `nuhokai map x` is an argument error and WorldMap never runs", async () => {
  const repo = mkdtempSync(join(tmpdir(), "nuhokai-bin-map-test-"));
  const cwd = process.cwd();
  try {
    expect((await runInit(repo)).outcome).toBe("ok");
    process.chdir(repo);

    expect(await failed(["map", "x"])).toEqual([2, ["nuhokai map: unexpected argument 'x'"]]);
    expect(existsSync(join(repo, "nuhokai/.generated/map.html"))).toBe(false);
    expect(await printed(["map"])).toEqual({ code: 0, out: ["nuhokai/.generated/map.html"], err: [] });
  } finally {
    process.chdir(cwd);
    rmSync(repo, { recursive: true, force: true });
  }
});

test("--path names the project directory, against the cwd; without it the cwd is the directory", async () => {
  const parent = mkdtempSync(join(tmpdir(), "nuhokai-bin-path-test-"));
  const project = join(parent, "packages", "app");
  mkdirSync(project, { recursive: true });
  const cwd = process.cwd();
  try {
    process.chdir(parent);

    expect(await printed(["map"])).toEqual({
      code: 1,
      out: [],
      err: ["nuhokai map: no nuhokai/ here; run `nuhokai init` to start a world here, or pass --path <project dir>"],
    });
    const init = await printed(["init", "--path", "packages/app"]);
    expect(init).toMatchObject({ code: 0, err: [] });
    expect(existsSync(join(project, "nuhokai/index.ts"))).toBe(true);
    expect(existsSync(join(parent, "nuhokai"))).toBe(false);
    // Printed paths are named from the cwd, so they can be opened as printed.
    expect(init.out).toContain("packages/app/nuhokai/index.ts");
    expect(await printed(["map", "--path=packages/app"])).toEqual({
      code: 0,
      out: ["packages/app/nuhokai/.generated/map.html"],
      err: [],
    });
    expect(existsSync(join(project, "nuhokai/.generated/map.html"))).toBe(true);
    // So are the paths in failures, the loader's included.
    writeFileSync(join(project, "nuhokai/orders.ts"), "export const boom = ;\n");
    expect(await printed(["map", "--path", "packages/app"])).toEqual({
      code: 1,
      out: [],
      err: ["nuhokai map: packages/app/nuhokai/orders.ts:1: Expression expected."],
    });
    expect(await printed(["map", "--path", "packages"])).toEqual({
      code: 1,
      out: [],
      err: ["nuhokai map: no nuhokai/ in packages; run `nuhokai init --path packages` to start a world there"],
    });
  } finally {
    process.chdir(cwd);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("a --path without a value, given twice or not a directory is a usage error and nothing runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-bin-path-test-"));
  const file = join(dir, "file");
  writeFileSync(file, "");
  expect(await failed(["init", "--path"])).toEqual([2, ["nuhokai init: --path needs a directory"]]);
  expect(await failed(["init", "--path", dir, "--path", dir])).toEqual([2, ["nuhokai init: --path given twice"]]);
  expect(await failed(["init", "--path", join(dir, "missing")])).toEqual([
    2,
    [`nuhokai init: not a directory: ${join(dir, "missing")}`],
  ]);
  expect(await failed(["init", "--path", file])).toEqual([2, [`nuhokai init: not a directory: ${file}`]]);
  expect(await failed(["map", `--path=${file}/x`])).toEqual([2, [`nuhokai map: not a directory: ${file}/x`]]);
  expect(await failed(["tree", "a", "--path"])).toEqual([2, ["nuhokai tree: --path needs a directory"]]);
  expect(await failed(["map", "--path", "--help"])).toEqual([2, ["nuhokai map: --path needs a directory"]]);
  expect(readdirSync(dir)).toEqual(["file"]);
  rmSync(dir, { recursive: true, force: true });
});

test("a help word next to --path prints the command's help, whatever the path", async () => {
  expect(await printed(["map", "--path", "x", "--help"])).toEqual({
    code: 0,
    out: [await help("map")],
    err: [],
  });
  expect(await printed(["map", "--path=x", "-h"])).toEqual({ code: 0, out: [await help("map")], err: [] });
});

test("before a command `help` is help; after one only -h and --help are", async () => {
  expect(await printed(["help"])).toEqual({ code: 0, out: [await usage()], err: [] });
  expect(await printed(["tree", "-h"])).toEqual({ code: 0, out: [await help("tree")], err: [] });
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
  expect(await printed(["check", "--help"])).toEqual({ code: 0, out: [await help("check")], err: [] });
  expect(await printed(["check", "--path", "x", "-h"])).toEqual({
    code: 0,
    out: [await help("check")],
    err: [],
  });
  expect(await help("check")).toContain("Usage: nuhokai check\n");
  expect(await usage()).toContain("nuhokai check");
});

test("`nuhokai check` runs Check in the cwd or under --path; `nuhokai check x` is an argument error and Check never runs", async () => {
  const parent = mkdtempSync(join(tmpdir(), "nuhokai-bin-check-test-"));
  const project = join(parent, "app");
  mkdirSync(project);
  const cwd = process.cwd();
  try {
    expect((await runInit(project)).outcome).toBe("ok");
    process.chdir(parent);

    // Check itself would name the missing world; an argument error never gets that far.
    expect(await failed(["check", "x", "--path", "app"])).toEqual([2, ["nuhokai check: unexpected argument 'x'"]]);
    expect(await failed(["check", "--pth", "app"])).toEqual([2, ["nuhokai check: unknown option '--pth'"]]);

    expect(await printed(["check"])).toEqual({
      code: 1,
      out: [],
      err: ["nuhokai check: no nuhokai/ here; run `nuhokai init` to start a world here, or pass --path <project dir>"],
    });
    expect(await printed(["check", "--path=app"])).toEqual({ code: 0, out: ["ok: 0 errors, 0 warnings"], err: [] });
    // Findings name their files from the cwd.
    writeFileSync(
      join(project, "nuhokai/orphan.ts"),
      'import { node } from "@nuhokai/world";\n\nexport const Orphan = node({ id: "o", purpose: "p", status: "planned", source: [] }).edges({});\n',
    );
    process.chdir(project);
    expect(await printed(["check"])).toEqual({
      code: 0,
      out: [
        "warning: nuhokai/orphan.ts:3: Orphan: exported but not reachable from the world; list it in a dome's children or in the world's (nuhokai/index.ts), or delete it",
        "ok: 0 errors, 1 warning",
      ],
      err: [],
    });
  } finally {
    process.chdir(cwd);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("Cli R3: usage and each command's help state the output, where failures go and the exit codes", async () => {
  const exitCodes =
    "Exit codes: 0 ok, 1 errors found or the command failed, 2 an invalid argument (an unknown option, a node path naming no node).";
  const commands = { check: checkCmd, init: initCmd, map: mapCmd, review: reviewCmd, tree: treeCmd };
  expect(await usage()).toContain(exitCodes);
  expect(await usage()).toContain(
    "Failures: one line each on stderr, `nuhokai <command>: <message>`; an argument error (an unknown option, a bad option value, an extra argument; exit 2) prints that command's help after its line; an unknown command is `nuhokai: unknown command '<name>'`, then usage.",
  );
  expect(await help("map")).toContain(
    "an argument error (an unknown option, a bad option value, an extra argument; exit 2) prints this help after its line. Every path",
  );
  expect(await help("tree")).toContain("`<path>/ (<children_count>)`");
  for (const [name, cmd] of Object.entries(commands)) {
    expect(await help(name)).toContain(`\nOutput: ${cmd.output}.\n`);
    expect(await help(name)).toContain(`Failures: one line each on stderr, \`nuhokai ${name}: <message>\``);
    expect(await help(name)).toEndWith(exitCodes);
  }
  expect(await help("check")).toContain(
    "Output: one line per finding, `<error|warning>: <file>:<line>: <node>: <rule>; <fix>`",
  );
  expect(await help("tree")).toContain(
    "Arguments:\n  node  the node to start from, by its path as tree prints it, e.g. Check/SpecCheck (default: the top level)\n",
  );
  expect(await help("map")).not.toContain("Arguments:");
});

test("`nuhokai tree --help` lists --level; usage shows tree's argument form", async () => {
  expect(await printed(["tree", "--help"])).toEqual({ code: 0, out: [await help("tree")], err: [] });
  expect(await printed(["tree", "-L", "2", "-h"])).toEqual({ code: 0, out: [await help("tree")], err: [] });
  // A bad value is judged after help, as a bad --path is.
  expect(await printed(["tree", "-L", "x", "--help"])).toEqual({
    code: 0,
    out: [await help("tree")],
    err: [],
  });
  expect(await printed(["tree", "--path", "nope", "--help"])).toEqual({
    code: 0,
    out: [await help("tree")],
    err: [],
  });
  expect(await help("tree")).toContain("Usage: nuhokai tree [node] [-L <n>]");
  expect(await help("tree")).toContain("-L, --level <n>");
  expect(await help("map")).not.toContain("--level");
  expect(await usage()).toContain("nuhokai tree [node] [-L <n>]");
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

test("Cli R6, R8: a missing or second --level, a bad one or -L on another command → exit 2, nothing runs", async () => {
  const run = spyOn(printTree, "runTree").mockResolvedValue(TREE_OK);
  try {
    expect(await failed(["tree", "-L"])).toEqual([2, ["nuhokai tree: -L needs a whole number"]]);
    expect(await failed(["tree", "--level="])).toEqual([2, ["nuhokai tree: --level needs a whole number"]]);
    expect(await failed(["tree", "-L", "--help"])).toEqual([2, ["nuhokai tree: -L needs a whole number"]]);
    expect(await failed(["tree", "-L", "1", "--level", "2"])).toEqual([2, ["nuhokai tree: --level given twice"]]);
    expect(await failed(["tree", "-L", "1", "-L", "2"])).toEqual([2, ["nuhokai tree: -L given twice"]]);
    // A value the option's parse rejects (tree.test.ts) is a usage error naming the spelling typed.
    expect(await failed(["tree", "-L", "x"])).toEqual([2, ["nuhokai tree: -L needs a whole number, got 'x'"]]);
    expect(await failed(["tree", "-L", "-1"])).toEqual([2, ["nuhokai tree: -L needs a whole number, got '-1'"]]);
    expect(await failed(["tree", "--level", "1.5"])).toEqual([
      2,
      ["nuhokai tree: --level needs a whole number, got '1.5'"],
    ]);
    expect(await failed(["tree", "--level=1.5"])).toEqual([
      2,
      ["nuhokai tree: --level needs a whole number, got '1.5'"],
    ]);
    expect(await failed(["tree", "a", "b", "c"])).toEqual([2, ["nuhokai tree: unexpected argument 'b'"]]);
    expect(await failed(["tree", "--depth", "2"])).toEqual([2, ["nuhokai tree: unknown option '--depth'"]]);
    expect(await failed(["map", "-L", "1"])).toEqual([2, ["nuhokai map: unknown option '-L'"]]);
    expect(run).not.toHaveBeenCalled();
  } finally {
    run.mockRestore();
  }
});

test("Cli R6, R7, R8: an option's own error, then a stray dash argument, then the count, then a value, then the directory", async () => {
  expect(await failed(["tree", "a", "b", "-L"])).toEqual([2, ["nuhokai tree: -L needs a whole number"]]);
  expect(await failed(["tree", "a", "b", "--bad", "-L", "x"])).toEqual([2, ["nuhokai tree: unknown option '--bad'"]]);
  expect(await failed(["tree", "x", "--help"])).toEqual([2, ["nuhokai tree: unexpected argument '--help'"]]);
  expect(await failed(["tree", "a", "b", "-L", "x"])).toEqual([2, ["nuhokai tree: unexpected argument 'b'"]]);
  expect(await failed(["tree", "--path", "nope", "-L", "x"])).toEqual([
    2,
    ["nuhokai tree: -L needs a whole number, got 'x'"],
  ]);
  expect(await failed(["map", "--path", "nope", "x"])).toEqual([2, ["nuhokai map: unexpected argument 'x'"]]);
});

test("Terminal R1: what the user typed reaches a usage error with each control character run as a space", async () => {
  expect(await failed(["\u001b[31mred"])).toEqual([2, ["nuhokai: unknown command ' [31mred'"]]);
  expect(await failed(["tree", "-L", "\u001b[31m"])).toEqual([
    2,
    ["nuhokai tree: -L needs a whole number, got ' [31m'"],
  ]);
  expect(await failed(["tree", "--b\u001bad"])).toEqual([2, ["nuhokai tree: unknown option '--b ad'"]]);
  expect(await failed(["map", "x\ny"])).toEqual([2, ["nuhokai map: unexpected argument 'x y'"]]);
  expect(await failed(["map", "--path", "no\r\u0007pe"])).toEqual([2, ["nuhokai map: not a directory: no pe"]]);
});

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

test("Terminal R1: a control character a command's line carries reaches the terminal as a space", async () => {
  const run = spyOn(printTree, "runTree").mockResolvedValue({
    outcome: "failed",
    lines: [
      { kind: "result", text: "\u001b[31mRED\u001b[0m" },
      { kind: "failure", text: "over\rwritten\nline" },
    ],
  });
  try {
    expect(await printed(["tree"])).toEqual({
      code: 1,
      out: [" [31mRED [0m"],
      err: ["nuhokai tree: over written line"],
    });
  } finally {
    run.mockRestore();
  }
});

test("Cli R9: a command whose run throws at once still has its CutShort's lines printed, then its bug thrown", async () => {
  const bug = new TypeError("boom");
  const run = spyOn(treeCmd, "run").mockImplementation(() => {
    throw new CutShort([resultLine("a"), failureLine("x")], bug);
  });
  try {
    expect(await printed(["tree"])).toEqual({ thrown: bug, out: ["a"], err: ["nuhokai tree: x"] });
  } finally {
    run.mockRestore();
  }
});

test("Cli R9: a bug in a command still crashes with it, after Cli prints the lines the command answered before it", async () => {
  const project = mkdtempSync(join(tmpdir(), "nuhokai-bin-crash-test-"));
  const cwd = process.cwd();
  const bug = new TypeError("boom");
  const spec = spyOn(specCheck, "applyRules").mockImplementation(() => {
    throw bug;
  });
  try {
    expect((await runInit(project)).outcome).toBe("ok");
    writeFileSync(join(project, "nuhokai/index.test.ts"), 'export const x: number = "one";\n');
    process.chdir(project);
    expect(await printed(["check"])).toEqual({
      thrown: bug,
      out: ["error: nuhokai/index.test.ts:1: Type 'string' is not assignable to type 'number'."],
      err: [],
    });
  } finally {
    process.chdir(cwd);
    spec.mockRestore();
    rmSync(project, { recursive: true, force: true });
  }
});

/** What a stubbed Review answers: done, nothing to print. */
const REVIEW_OK: Report = { outcome: "ok", lines: [] };

test("Cli R3, R10: review's help explains the flow to --submit, its exit codes and finding a node with tree", async () => {
  expect(await usage()).toContain("nuhokai review [node] [--submit]");
  const text = await help("review");
  expect(text).toContain("Usage: nuhokai review [node] [--submit]");
  expect(text).toContain("  --submit      validate the review JSON piped to stdin");
  expect(text).toContain("pipes its findings as JSON to `nuhokai review --submit`");
  expect(text).toContain("by its path as `nuhokai tree` prints it");
  expect(text).toContain(
    "exit 0 when the review passes (warnings allowed), 1 on an against-spec finding, 2 for an invalid submission",
  );
  expect(text).toContain("<error|warning>: <file>:<line>: <node>: <spec item|unspecified>; <evidence>");
  expect(await printed(["review", "--submit", "--help"])).toEqual({ code: 0, out: [text], err: [] });
});

test("Cli R6, R10: review hands Review.run the directory and the path, Review.submit the directory and stdin's text", async () => {
  const run = spyOn(reviewPrompt, "runReviewPrompt").mockResolvedValue(REVIEW_OK);
  const submit = spyOn(reviewSubmission, "runReviewSubmission").mockResolvedValue(REVIEW_OK);
  try {
    const unread = stdinOf("{}");
    expect(await printed(["review", "Tree/PrintTree"], unread)).toEqual({ code: 0, out: [], err: [] });
    expect(run.mock.calls).toEqual([[".", "Tree/PrintTree"]]);
    // Without --submit, stdin is never read.
    expect(unread.reads).toBe(0);
    const piped = stdinOf('{"node":"Tree/PrintTree"}\n');
    expect(await printed(["review", "--submit"], piped)).toEqual({ code: 0, out: [], err: [] });
    expect(submit.mock.calls).toEqual([[".", '{"node":"Tree/PrintTree"}\n']]);
    expect(piped.reads).toBe(1);
    // A slow producer: input starts within the wait, then pauses longer than it; Cli reads on to the end.
    const encode = (text: string) => new TextEncoder().encode(text);
    const slow = {
      isTTY: false,
      waitMs: 50,
      stream: () =>
        new ReadableStream<Uint8Array>({
          async start(controller) {
            await Bun.sleep(20);
            controller.enqueue(encode('{"node":'));
            await Bun.sleep(200);
            controller.enqueue(encode('"Tree/PrintTree"}'));
            controller.close();
          },
        }),
    };
    expect(await printed(["review", "--submit"], slow)).toEqual({ code: 0, out: [], err: [] });
    expect(submit.mock.calls[1]).toEqual([".", '{"node":"Tree/PrintTree"}']);
  } finally {
    run.mockRestore();
    submit.mockRestore();
  }
});

test("Cli R6, R10: a node beside --submit, neither, a terminal or empty input, --submit=x → exit 2, nothing runs", async () => {
  const run = spyOn(reviewPrompt, "runReviewPrompt").mockResolvedValue(REVIEW_OK);
  const submit = spyOn(reviewSubmission, "runReviewSubmission").mockResolvedValue(REVIEW_OK);
  try {
    const both = stdinOf("{}");
    expect(await failed(["review", "--submit", "Tree/PrintTree"])).toEqual([
      2,
      ["nuhokai review: give a node or --submit, not both: 'Tree/PrintTree' and --submit"],
    ]);
    expect(await printed(["review", "Tree/PrintTree", "--submit"], both)).toMatchObject({ code: 2 });
    expect(both.reads).toBe(0);
    expect(await failed(["review"])).toEqual([
      2,
      ["nuhokai review: give a node, or --submit with its input piped to stdin"],
    ]);
    const terminal = stdinOf(undefined);
    const fromTty = await printed(["review", "--submit"], terminal);
    expect(fromTty).toMatchObject({ code: 2, out: [] });
    expect((fromTty.err[0] ?? "").split("\n")[0]).toBe(
      "nuhokai review: --submit reads stdin, but stdin is a terminal; pipe it in: nuhokai review --submit < <file>",
    );
    // A terminal is never read, so nothing waits.
    expect(terminal.reads).toBe(0);
    // Empty input, and a pipe left open with nothing in it (exec and spawn leave stdin open), end in a usage error.
    for (const empty of [stdinOf(""), stdinOf(" \n"), stdinOf("", { open: true }), stdinOf("{}", { delayMs: 200 })]) {
      const result = await printed(["review", "--submit"], empty);
      expect(result).toMatchObject({ code: 2, out: [] });
      expect((result.err[0] ?? "").split("\n")[0]).toBe(
        "nuhokai review: --submit got no input on stdin; pipe it in: nuhokai review --submit < <file>",
      );
    }
    expect(await failed(["review", "--submit=x"])).toEqual([2, ["nuhokai review: --submit takes no value"]]);
    expect(await failed(["review", "--submit", "--submit"])).toEqual([2, ["nuhokai review: --submit given twice"]]);
    expect(await failed(["review", "a", "b"])).toEqual([2, ["nuhokai review: unexpected argument 'b'"]]);
    expect(await failed(["tree", "--submit"])).toEqual([2, ["nuhokai tree: unknown option '--submit'"]]);
    expect(run).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  } finally {
    run.mockRestore();
    submit.mockRestore();
  }
});

test("Review: in packages/cli, review Tree/PrintTree prints the prompt, exit 0; a dome or no source, exit 2; a submission exits by its findings", async () => {
  const cwd = process.cwd();
  try {
    process.chdir(join(import.meta.dir, ".."));
    const prompt = await printed(["review", "Tree/PrintTree"]);
    expect(prompt).toMatchObject({ code: 0, err: [] });
    const out = "out" in prompt ? prompt.out.join("\n") : "";
    expect(out).toContain("- src/tree/print-tree.ts");
    expect(out).toContain("- src/tree/print-tree.test.ts");
    for (const ref of ["requirements[R1]", "requirements[R2]", "requirements[R3]"]) expect(out).toContain(`- ${ref} (`);
    expect(out).toContain("- LoadWorld: load (");
    expect(await failed(["review", "Check"])).toEqual([
      2,
      ["nuhokai review: Check is a dome, and a review covers one leaf; `nuhokai tree Check` lists its children"],
    ]);
    expect((await failed(["review", "Terminal"]))[0]).toBe(2);

    const files = ["src/tree/print-tree.ts", "src/tree/print-tree.test.ts"];
    const submit = (findings: unknown[]) =>
      printed(
        ["review", "--submit"],
        stdinOf(JSON.stringify({ node: "Tree/PrintTree", reviewedFiles: files, findings })),
      );
    expect(await submit([])).toEqual({ code: 0, out: ["ok: 0 errors, 0 warnings"], err: [] });
    expect(
      await submit([
        { category: "against-spec", specItem: "requirements[R2]", file: files[0], line: 3, evidence: "e" },
        { category: "unspecified", file: files[0], line: 4, evidence: "u" },
      ]),
    ).toEqual({
      code: 1,
      out: [
        "error: src/tree/print-tree.ts:3: Tree/PrintTree: requirements[R2]; e",
        "warning: src/tree/print-tree.ts:4: Tree/PrintTree: unspecified; u",
        "failed: 1 error, 1 warning",
      ],
      err: [],
    });
    const cited = await submit([
      { category: "against-spec", specItem: "requirements[R9]", file: files[0], line: 3, evidence: "e" },
    ]);
    expect(cited).toMatchObject({ code: 2, out: [] });
  } finally {
    process.chdir(cwd);
  }
});
