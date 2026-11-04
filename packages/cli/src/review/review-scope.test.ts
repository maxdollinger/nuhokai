import { afterEach, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { runInit } from "../init/scaffold.ts";
import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { CliError } from "../shared/failure.ts";
import { reviewScope } from "./review-scope.ts";

/** The CLI's own world, named from the cwd as a command names it. */
const PACKAGE = join(import.meta.dir, "../..");
const ROOT = relative(process.cwd(), PACKAGE) || ".";
/** A path in the package, named from the cwd. */
const named = (path: string) => (ROOT === "." ? path : `${ROOT}/${path}`);
let own: LoadedWorld;
const temps: string[] = [];

beforeAll(async () => {
  own = await loadWorld(ROOT);
});

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The position of the node at a hierarchy path. */
function at(world: LoadedWorld, path: string): number {
  const node = world.nodes.find((candidate) => candidate.path === path);
  if (!node) throw new Error(`no ${path}`);
  return node.index;
}

/** What reviewScope throws, as its message; the test fails if it answers. */
function refusal(root: string, world: LoadedWorld, path: string): string {
  try {
    reviewScope(root, world, at(world, path));
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return (error as Error).message;
  }
  throw new Error(`${path} is reviewable`);
}

/** An init'd project whose example node lists `source`, with src/example.ts written. */
async function example(source: string): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "nuhokai-review-scope-"));
  temps.push(root);
  expect((await runInit(root)).outcome).toBe("ok");
  const file = join(root, "nuhokai/example.ts");
  writeFileSync(file, readFileSync(file, "utf8").replace("source: [],", `source: ${source},`));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/example.ts"), "export {};\n");
  return root;
}

test("R2, R3: PrintTree's files and what it may use; LoadWorld's files are every file under src/load/, sorted", () => {
  const scope = reviewScope(ROOT, own, at(own, "Tree/PrintTree"));
  expect(scope.node).toBe("Tree/PrintTree");
  expect(scope.specFile).toBe(named("nuhokai/tree/print-tree.ts"));
  expect(scope.files).toEqual([named("src/tree/print-tree.test.ts"), named("src/tree/print-tree.ts")]);
  expect(scope.uses.map((use) => [use.path, use.ports])).toEqual([
    ["LoadWorld", ["load"]],
    ["Path", ["findNode"]],
    ["Tree/TreeLines", ["render"]],
    ["Failure", ["format", "report"]],
  ]);
  expect(scope.uses[0]).toMatchObject({ source: [named("src/load/**")], external: false });
  expect(scope.uses[0]?.purpose).toStartWith("Read nuhokai/ without running it");
  expect(scope.drafts).toEqual([]);
  expect(scope.items.length).toBeGreaterThan(0);

  const load = reviewScope(ROOT, own, at(own, "LoadWorld"));
  const expected = readdirSync(join(PACKAGE, "src/load"))
    .sort()
    .map((file) => named(`src/load/${file}`));
  expect(load.files).toEqual(expected);
});

test("R3: an external dependency says so", () => {
  const cli = reviewScope(ROOT, own, at(own, "Cli"));
  expect(cli.uses.find((use) => use.path === "Terminal")).toMatchObject({ external: true, ports: expect.any(Array) });
});

test("R1: a dome names tree, a node without source says why, a source matching nothing names check", async () => {
  expect(refusal(ROOT, own, "Check")).toBe(
    `Check is a dome, and a review covers one leaf; \`nuhokai tree Check${ROOT === "." ? "" : ` --path ${ROOT}`}\` lists its children`,
  );
  expect(refusal(ROOT, own, "Terminal")).toBe(
    "Terminal has no source to review: it is external; review a node whose source lists its code",
  );
  const root = await example('["src/gone.ts"]');
  expect(refusal(root, await loadWorld(root), "Example")).toBe(
    `Example's source matches no file; \`nuhokai check --path ${root}\` names the entry to fix`,
  );
});

test("R4, R5: the example node's tbd is one draft with its description, never among the uses; same input, same scope", async () => {
  const root = await example('["src/**"]');
  const world = await loadWorld(root);
  const scope = reviewScope(root, world, at(world, "Example"));
  expect(scope.drafts).toEqual([{ description: "Describe what this node has to do", name: "later" }]);
  expect(scope.uses).toEqual([]);
  expect(scope.files).toEqual([`${root}/src/example.ts`]);
  expect(reviewScope(root, world, at(world, "Example"))).toEqual(scope);
});
