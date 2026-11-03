import { afterEach, expect, test } from "bun:test";
import {
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
import { runInit } from "../init/scaffold.ts";
import { runMap } from "./draw-map.ts";

const MAP = "nuhokai/.generated/map.html";
const roots: string[] = [];

// Every test gets its own repo: Bun caches a world module by path for the whole process.
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-map-test-"));
  roots.push(dir);
  return dir;
}

/** Run map: its outcome and its result and failure lines, as Cli would print them on stdout and stderr. */
async function map(root: string) {
  const report = await runMap(root);
  const texts = (kind: "result" | "failure") =>
    report.lines.filter((line) => line.kind === kind).map((line) => line.text);
  return { outcome: report.outcome, out: texts("result"), err: texts("failure") };
}

/** Every file in the directory, with its bytes. */
function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
      .sort()
      .map((path) => [path, readFileSync(join(dir, path), "utf8")]),
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("after init, map writes the map and reports its path; a second run changes no other file", async () => {
  const repo = tempDir();
  expect((await runInit(repo)).outcome).toBe("ok");
  const before = snapshot(repo);
  const output = await map(repo);

  expect(output.outcome).toBe("ok");
  expect(output.out).toEqual([join(repo, MAP)]);
  expect(output.err).toEqual([]);
  const after = snapshot(repo);
  expect(Object.keys(after)).toEqual([...Object.keys(before), MAP].sort());
  expect(after[MAP]).toContain('"name":"Example"');

  const again = await map(repo);
  expect(again.outcome).toBe("ok");
  expect(again.out).toEqual([join(repo, MAP)]);
  expect(snapshot(repo)).toEqual(after);
});

test("an orphan and an out-of-scope uses edge still get a map", async () => {
  const repo = tempDir();
  expect((await runInit(repo)).outcome).toBe("ok");
  writeFileSync(
    join(repo, "nuhokai/orphan.ts"),
    `import { node } from "@nuhokai/world";
import { Example } from "./example.ts";

export const Inner = node({ id: "inner", purpose: "i", status: "planned", source: [], ports: { x: { kind: "call", purpose: "x" } } }).edges({});
export const Box = node({ id: "box", purpose: "b", status: "planned", source: [], children: [Inner], ports: {} }).edges({});
// Out of scope: Inner sits inside Box's dome. Not in the world: an orphan.
export const Orphan = node({ id: "orphan", purpose: "o", status: "planned", source: [] }).edges({ uses: () => [Inner.x, Example.greet] });
`,
  );
  writeFileSync(
    join(repo, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { Example } from "./example.ts";
import { Box } from "./orphan.ts";

export default defineWorld({ id: "w", name: "w", source: [], children: [Example, Box] });
`,
  );
  const output = await map(repo);

  expect(output.outcome).toBe("ok");
  expect(output.out).toEqual([join(repo, MAP)]);
  expect(readFileSync(join(repo, MAP), "utf8")).toContain('"name":"Box"');
});

test("no world, or a file at nuhokai: one failure line, failed, nothing written", async () => {
  const empty = tempDir();
  const output = await map(empty);

  expect(output.outcome).toBe("failed");
  expect(output.out).toEqual([]);
  expect(output.err).toEqual([`no nuhokai/ in ${empty}; run \`nuhokai init --path ${empty}\` to start a world there`]);
  expect(snapshot(empty)).toEqual({});

  const occupied = tempDir();
  writeFileSync(join(occupied, "nuhokai"), "in the way\n");
  const second = await map(occupied);

  expect(second.outcome).toBe("failed");
  expect(second.out).toEqual([]);
  expect(second.err).toEqual([`${occupied}/nuhokai exists but is not a directory`]);
  expect(snapshot(occupied)).toEqual({ nuhokai: "in the way\n" });
});

test("a symlinked nuhokai/ is the world: map draws it into the linked folder", async () => {
  const repo = tempDir();
  const shared = join(repo, "shared");
  mkdirSync(shared);
  expect((await runInit(shared)).outcome).toBe("ok");
  const project = join(repo, "app");
  mkdirSync(project);
  symlinkSync("../shared/nuhokai", join(project, "nuhokai"));
  const output = await map(project);

  expect(output.outcome).toBe("ok");
  expect(output.err).toEqual([]);
  expect(output.out).toEqual([join(project, MAP)]);
  expect(existsSync(join(shared, MAP))).toBe(true);
});

test("a node file that does not parse: one failure line naming the file, failed, the previous map kept", async () => {
  const repo = tempDir();
  expect((await runInit(repo)).outcome).toBe("ok");
  expect((await map(repo)).outcome).toBe("ok");
  const previous = readFileSync(join(repo, MAP), "utf8");
  writeFileSync(join(repo, "nuhokai/orders.ts"), "export const orders = ;\n");
  const output = await map(repo);

  expect(output.outcome).toBe("failed");
  expect(output.out).toEqual([]);
  expect(output.err).toEqual([`${repo}/nuhokai/orders.ts:1: Expression expected.`]);
  expect(readFileSync(join(repo, MAP), "utf8")).toBe(previous);
});

test("the write failed: one failure line, outcome failed, no result line", async () => {
  const repo = tempDir();
  expect((await runInit(repo)).outcome).toBe("ok");
  mkdirSync(join(repo, MAP));
  const before = snapshot(repo);
  const output = await map(repo);

  expect(output.outcome).toBe("failed");
  expect(output.out).toEqual([]);
  expect(output.err).toHaveLength(1);
  expect(output.err[0]).toStartWith("EISDIR");
  expect(snapshot(repo)).toEqual(before);
});
