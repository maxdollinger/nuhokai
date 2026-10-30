import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMANDS, commandUsage, main, usage } from "./bin.ts";
import { runInit } from "./init/index.ts";

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

test("`nuhokai new --help` shows that new takes a path", async () => {
  expect(await logged(["new", "--help"])).toEqual([0, [commandUsage("new")]]);
  expect(commandUsage("new")).toContain("Usage: nuhokai new <node-path>");
});

test("Cli enforces the argument count without validating the argument", async () => {
  expect(await main(["new"])).toBe(2);
  expect(await main(["new", "a", "b"])).toBe(2);
  // The count is the dispatcher's; the value is New's, which rejects this one with its own 2.
  expect(await main(["new", "new/StockOrder"])).toBe(2);
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
    expect(await runInit(repo, { out: () => {} })).toBe(0);
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
    writeFileSync(join(project, "nuhokai/orders.ts"), 'throw new Error("boom");\n');
    expect(await main(["map", "--path", "packages/app"])).toBe(1);
    expect(err.at(-1)).toBe("nuhokai map: packages/app/nuhokai/orders.ts:1: boom");
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
    expect(await main(["new", "a", "--path"])).toBe(2);
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
    "nuhokai new: --path needs a directory",
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
  expect(await logged(["new", "-h"])).toEqual([0, [commandUsage("new")]]);
  expect(await failed(["map", "help"])).toEqual([2, ["nuhokai map: unexpected argument 'help'"]]);

  const repo = mkdtempSync(join(tmpdir(), "nuhokai-bin-help-test-"));
  try {
    expect(await runInit(repo, { out: () => {} })).toBe(0);
    const [code, out] = await logged(["new", "help", "--path", repo]);
    expect(code).toBe(0);
    expect(out[0]).toEndWith("nuhokai/help.ts");
    expect(existsSync(join(repo, "nuhokai/help.ts"))).toBe(true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("an unknown option or an extra argument is named, exit 2, nothing runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-bin-args-test-"));
  try {
    expect(await failed(["map", "--pth", dir])).toEqual([2, ["nuhokai map: unknown option '--pth'"]]);
    expect(await failed(["init", "--force", "--path", dir])).toEqual([2, ["nuhokai init: unknown option '--force'"]]);
    expect(await failed(["new", "a", "b", "c", "--path", dir])).toEqual([2, ["nuhokai new: unexpected argument 'b'"]]);
    expect(await failed(["init", "x", "--path", dir])).toEqual([2, ["nuhokai init: unexpected argument 'x'"]]);
    expect(await failed(["new", "--path", dir])).toEqual([2, ["nuhokai new: expected 1 argument, got 0"]]);
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
    expect(await runInit(project, { out: () => {} })).toBe(0);
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
