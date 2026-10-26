import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { WORLD_TYPES } from "../toolchain/world-types.gen.ts";
import { TSCONFIG_PATH, TSCONFIG_TEMPLATE, WORLD_TYPES_PATH, writeCliFiles } from "./cli-files.ts";
import { EXAMPLE_TEMPLATE, WORLD_INDEX_TEMPLATE } from "./example-world.ts";
import { inspectTarget } from "./inspect.ts";
import { runInit, scaffold } from "./scaffold.ts";

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

function gitRepo(): string {
  const dir = tempDir();
  const result = Bun.spawnSync(["git", "init", "-q", dir], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git init failed: ${result.stderr}`);
  return dir;
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    environment: {
      out: (line: string) => out.push(line),
      err: (line: string) => err.push(line),
    },
  };
}

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .filter((path) => !path.startsWith(".git"))
    .sort();
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

test("init writes exactly the four world files and prints their paths", async () => {
  const repo = gitRepo();
  const output = capture();

  expect(await runInit(repo, output.environment)).toBe(0);
  expect(output.err).toEqual([]);
  expect(output.out).toEqual(WORLD_FILES);
  expect(files(repo)).toEqual([...WORLD_FILES].sort());

  expect(readFileSync(join(repo, "nuhokai/index.ts"), "utf8")).toBe(WORLD_INDEX_TEMPLATE);
  expect(readFileSync(join(repo, "nuhokai/example.ts"), "utf8")).toBe(EXAMPLE_TEMPLATE);
  expect(readFileSync(join(repo, "nuhokai/tsconfig.json"), "utf8")).toBe(TSCONFIG_TEMPLATE);
  expect(readFileSync(join(repo, WORLD_TYPES_PATH), "utf8")).toBe(WORLD_TYPES);

  // The example shows a port, a typed hole and a uses edge to it.
  expect(EXAMPLE_TEMPLATE).toContain("ports:");
  expect(EXAMPLE_TEMPLATE).toContain("tbd.call(");
  expect(EXAMPLE_TEMPLATE).toContain("uses: () => [later]");
});

test("two repos get byte-identical worlds", async () => {
  const first = gitRepo();
  const second = gitRepo();
  expect(await runInit(first, capture().environment)).toBe(0);
  expect(await runInit(second, capture().environment)).toBe(0);

  for (const path of WORLD_FILES) {
    expect(readFileSync(join(second, path))).toEqual(readFileSync(join(first, path)));
  }
});

test("the written world type-checks through the CLI-owned tsconfig alone", async () => {
  const repo = gitRepo();
  expect(await runInit(repo, capture().environment)).toBe(0);

  const result = Bun.spawnSync([TSC, "-p", join(repo, "nuhokai/tsconfig.json"), "--pretty", "false"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(`${result.stdout}${result.stderr}`).toBe("");
  expect(result.exitCode).toBe(0);
});

test("the written world loads as exactly one node, Example", async () => {
  const repo = gitRepo();
  expect(await runInit(repo, capture().environment)).toBe(0);

  // Resolve the runtime package for the import only; init never writes node_modules.
  mkdirSync(join(repo, "node_modules/@nuhokai"), { recursive: true });
  symlinkSync(join(import.meta.dir, "../../../world"), join(repo, "node_modules/@nuhokai/world"), "dir");

  const world = (await import(pathToFileURL(join(repo, "nuhokai/index.ts")).href)).default;
  expect(world.$ref).toBe("world");
  expect(world.children).toHaveLength(1);

  const [example] = world.children;
  expect(example.$ref).toBe("node");
  expect(Object.keys(example.$def.ports)).toEqual(["greet"]);
  expect(typeof example.$def.uses).toBe("function");
  expect(example.$def.uses()).toHaveLength(1);
  expect(example.$def.uses()[0].$ref).toBe("unresolved");
});

test("an existing world stays untouched, exit 0 with one line", async () => {
  const repo = gitRepo();
  expect(await runInit(repo, capture().environment)).toBe(0);

  writeFileSync(join(repo, "nuhokai/example.ts"), "// edited by hand\n");
  const before = files(repo);
  const output = capture();

  expect(await runInit(repo, output.environment)).toBe(0);
  expect(output.err).toEqual([]);
  expect(output.out).toHaveLength(1);
  expect(output.out[0]).toContain("nothing to do");
  expect(files(repo)).toEqual(before);
  expect(readFileSync(join(repo, "nuhokai/example.ts"), "utf8")).toBe("// edited by hand\n");
});

test("a file at nuhokai/ is one error line and leaves it alone", async () => {
  const repo = gitRepo();
  writeFileSync(join(repo, "nuhokai"), "in the way\n");
  const output = capture();

  expect(await runInit(repo, output.environment)).toBe(1);
  expect(output.out).toEqual([]);
  expect(output.err).toHaveLength(1);
  expect(readFileSync(join(repo, "nuhokai"), "utf8")).toBe("in the way\n");
});

test("a symlink at nuhokai/ is occupied, not a world", async () => {
  const repo = gitRepo();
  const elsewhere = tempDir();
  symlinkSync(elsewhere, join(repo, "nuhokai"));
  const output = capture();

  expect(inspectTarget(repo)).toEqual({ kind: "occupied" });
  expect(await runInit(repo, output.environment)).toBe(1);
  expect(output.err).toHaveLength(1);
});

test("init targets the Git root even from a subdirectory", async () => {
  const repo = gitRepo();
  const subdirectory = join(repo, "src");
  mkdirSync(subdirectory);
  const output = capture();

  expect(await runInit(subdirectory, output.environment)).toBe(0);
  expect(files(repo)).toEqual([...WORLD_FILES].sort());
  expect(existsSync(join(subdirectory, "nuhokai"))).toBe(false);
});

test("Git env vars cannot redirect the target", async () => {
  const repo = gitRepo();
  const elsewhere = gitRepo();
  const subdirectory = join(repo, "src");
  mkdirSync(subdirectory);
  const output = capture();

  process.env.GIT_DIR = join(elsewhere, ".git");
  process.env.GIT_WORK_TREE = elsewhere;
  try {
    expect(await runInit(subdirectory, output.environment)).toBe(0);
  } finally {
    delete process.env.GIT_DIR;
    delete process.env.GIT_WORK_TREE;
  }
  expect(output.err).toEqual([]);
  expect(files(repo)).toEqual([...WORLD_FILES].sort());
  expect(existsSync(join(elsewhere, "nuhokai"))).toBe(false);
});

test("a second write of identical CLI-owned files rewrites nothing", () => {
  const repo = tempDir();
  const modificationTimes = () => [TSCONFIG_PATH, WORLD_TYPES_PATH].map((path) => statSync(join(repo, path)).mtimeMs);

  expect(writeCliFiles(repo)).toEqual({ written: [TSCONFIG_PATH, WORLD_TYPES_PATH], unchanged: [] });
  const written = modificationTimes();
  expect(writeCliFiles(repo)).toEqual({ written: [], unchanged: [TSCONFIG_PATH, WORLD_TYPES_PATH] });
  expect(modificationTimes()).toEqual(written);
});

test("a programming error crashes instead of becoming one line", async () => {
  const repo = gitRepo();
  const boom = new TypeError("boom");
  let thrown: unknown;
  try {
    await scaffold(repo, {
      gitRoot: () => {
        throw boom;
      },
    });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBe(boom);
});

test("without Git and without a terminal, init writes nothing", async () => {
  const dir = tempDir();
  const output = capture();

  expect(await runInit(dir, { ...output.environment, gitRoot: () => null, isTTY: false })).toBe(1);
  expect(output.err).toHaveLength(1);
  expect(readdirSync(dir)).toEqual([]);
});

test("without Git, 'no' writes nothing and 'yes' uses the cwd", async () => {
  const declined = tempDir();
  const declinedOutput = capture();
  const code = await runInit(declined, {
    ...declinedOutput.environment,
    gitRoot: () => null,
    isTTY: true,
    confirm: async () => false,
  });
  expect(code).toBe(1);
  expect(declinedOutput.out).toEqual([]);
  expect(readdirSync(declined)).toEqual([]);

  const accepted = tempDir();
  const acceptedOutput = capture();
  const acceptedCode = await runInit(accepted, {
    ...acceptedOutput.environment,
    gitRoot: () => null,
    isTTY: true,
    confirm: async () => true,
  });
  expect(acceptedCode).toBe(0);
  expect(acceptedOutput.out).toEqual(WORLD_FILES);
  expect(files(accepted)).toEqual([...WORLD_FILES].sort());
});

test.skipIf(process.getuid?.() === 0)("a failed write leaves no nuhokai/ and no staging path", async () => {
  const repo = gitRepo();
  chmodSync(repo, 0o500);
  const output = capture();

  expect(await runInit(repo, output.environment)).toBe(1);
  expect(output.err).toHaveLength(1);
  expect(readdirSync(repo).filter((name) => name !== ".git")).toEqual([]);
});
