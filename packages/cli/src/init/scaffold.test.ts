import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../load/load-world.ts";
import { inspectTarget } from "../shared/inspect.ts";
import { type SplitReport, splitReport } from "../shared/split-report.ts";
import { WORLD_TSCONFIG, WORLD_TYPES_PATH } from "../shared/world-path.ts";
import { WORLD_TYPES } from "../toolchain/world-types.gen.ts";
import { TSCONFIG_TEMPLATE, writeCliFiles } from "./cli-files.ts";
import { EXAMPLE_TEMPLATE, worldIndexSource } from "./example-world.ts";
import { runInit } from "./scaffold.ts";

const TSC = join(import.meta.dir, "../../../../node_modules/.bin/tsc");
const WORLD_FILES = [
  "nuhokai/index.ts",
  "nuhokai/example.ts",
  "nuhokai/tsconfig.json",
  "nuhokai/.generated/world/index.d.ts",
];
const roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-init-test-"));
  roots.push(dir);
  return dir;
}

/** Run init: its outcome and its result and failure lines, as Cli would print them on stdout and stderr. */
async function init(root: string): Promise<SplitReport> {
  return splitReport(await runInit(root));
}

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();
}

/** The world id init wrote into the repo's nuhokai/index.ts. */
function worldIdOf(repo: string): string {
  return readFileSync(join(repo, "nuhokai/index.ts"), "utf8").match(/\bid: "([^"]+)"/)?.[1] ?? "";
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

test("init writes exactly the four world files and reports their paths", async () => {
  const repo = tempDir();
  const output = await init(repo);

  expect(output.outcome).toBe("ok");
  expect(output.err).toEqual([]);
  expect(output.out).toEqual(WORLD_FILES.map((path) => join(repo, path)));
  expect(files(repo)).toEqual([...WORLD_FILES].sort());

  expect(readFileSync(join(repo, "nuhokai/index.ts"), "utf8")).toBe(worldIndexSource(worldIdOf(repo)));
  expect(readFileSync(join(repo, "nuhokai/example.ts"), "utf8")).toBe(EXAMPLE_TEMPLATE);
  expect(readFileSync(join(repo, "nuhokai/tsconfig.json"), "utf8")).toBe(TSCONFIG_TEMPLATE);
  expect(readFileSync(join(repo, "nuhokai", WORLD_TYPES_PATH), "utf8")).toBe(WORLD_TYPES);

  // The example shows a port, a typed hole and a uses edge to it.
  expect(EXAMPLE_TEMPLATE).toContain("ports:");
  expect(EXAMPLE_TEMPLATE).toContain("tbd.call(");
  expect(EXAMPLE_TEMPLATE).toContain("uses: () => [later]");
});

test("two repos get worlds that differ only in their fresh world ids", async () => {
  const first = tempDir();
  const second = tempDir();
  expect((await init(first)).outcome).toBe("ok");
  expect((await init(second)).outcome).toBe("ok");

  expect(worldIdOf(first)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(worldIdOf(second)).not.toBe(worldIdOf(first));
  for (const path of WORLD_FILES.filter((path) => path !== "nuhokai/index.ts")) {
    expect(readFileSync(join(second, path))).toEqual(readFileSync(join(first, path)));
  }
});

test("the written world type-checks through the CLI-owned tsconfig alone", async () => {
  const repo = tempDir();
  expect((await init(repo)).outcome).toBe("ok");

  const result = Bun.spawnSync([TSC, "-p", join(repo, "nuhokai/tsconfig.json"), "--pretty", "false"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(`${result.stdout}${result.stderr}`).toBe("");
  expect(result.exitCode).toBe(0);
});

test("the written world loads as exactly one node, Example", async () => {
  const repo = tempDir();
  expect((await init(repo)).outcome).toBe("ok");

  const world = await loadWorld(repo);
  expect(world.id).toBe(worldIdOf(repo));
  const [example] = world.nodes.map((node) => node.spec);
  expect(world.nodes.map((node) => node.path)).toEqual(["Example"]);
  expect(example?.ports?.map((port) => port.name)).toEqual(["greet"]);
  expect(world.placeholders.map((hole) => hole.users)).toEqual([[example?.id ?? ""]]);
});

test("an existing world stays untouched, ok with one result line", async () => {
  const repo = tempDir();
  expect((await init(repo)).outcome).toBe("ok");

  writeFileSync(join(repo, "nuhokai/example.ts"), "// edited by hand\n");
  const before = files(repo);
  const output = await init(repo);

  expect(output.outcome).toBe("ok");
  expect(output.err).toEqual([]);
  expect(output.out).toEqual([`${repo}/nuhokai/ already exists; nothing to do`]);
  expect(files(repo)).toEqual(before);
  expect(readFileSync(join(repo, "nuhokai/example.ts"), "utf8")).toBe("// edited by hand\n");
});

test("a file at nuhokai/ is one failure line and leaves it alone", async () => {
  const repo = tempDir();
  writeFileSync(join(repo, "nuhokai"), "in the way\n");
  const output = await init(repo);

  expect(output.outcome).toBe("failed");
  expect(output.out).toEqual([]);
  expect(output.err).toEqual([`${repo}/nuhokai exists but is not a directory`]);
  expect(readFileSync(join(repo, "nuhokai"), "utf8")).toBe("in the way\n");
});

test("a symlink at nuhokai/ is occupied, not a world", async () => {
  const repo = tempDir();
  const elsewhere = tempDir();
  symlinkSync(elsewhere, join(repo, "nuhokai"));
  expect(inspectTarget(repo)).toEqual({ kind: "occupied" });
  const output = await init(repo);

  expect(output.outcome).toBe("failed");
  expect(output.err).toEqual([`${repo}/nuhokai exists but is not a directory`]);
});

test("init writes into the directory it is given", async () => {
  const repo = tempDir();
  const subdirectory = join(repo, "src");
  mkdirSync(subdirectory);
  const output = await init(subdirectory);

  expect(output.outcome).toBe("ok");
  expect(output.out).toEqual(WORLD_FILES.map((path) => join(subdirectory, path)));
  expect(files(subdirectory)).toEqual([...WORLD_FILES].sort());
  expect(existsSync(join(repo, "nuhokai"))).toBe(false);
});

test("CliFiles R4: two writes give the same bytes", () => {
  const repo = tempDir();
  const bytes = () =>
    [WORLD_TSCONFIG, WORLD_TYPES_PATH].map((path) => readFileSync(join(repo, "nuhokai", path), "utf8"));

  expect(writeCliFiles(repo)).toEqual([WORLD_TSCONFIG, WORLD_TYPES_PATH]);
  const first = bytes();
  writeCliFiles(repo);
  expect(bytes()).toEqual(first);
});

test("a programming error crashes instead of becoming one failure line", async () => {
  // A root that is not a string is a caller bug: a TypeError, not a failure line.
  await expect(runInit(undefined as never)).rejects.toBeInstanceOf(TypeError);
});

test.skipIf(process.getuid?.() === 0)("a failed write leaves no nuhokai/ and no staging path", async () => {
  const repo = tempDir();
  chmodSync(repo, 0o500);
  const output = await init(repo);

  expect(output.outcome).toBe("failed");
  expect(output.err).toHaveLength(1);
  expect(readdirSync(repo)).toEqual([]);
});
