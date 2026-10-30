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
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineWorld } from "@nuhokai/world";
import { runInit } from "../init/scaffold.ts";
import { CliError } from "../shared/failure.ts";
import { loadWorld } from "./load-world.ts";

const EXAMPLE = join(import.meta.dir, "../../../world/example");
const BIN = join(import.meta.dir, "../bin.ts");
const EXAMPLE_ID = "01a17290-3f10-7c54-8e51-0b63d9f2a7c4";
const roots: string[] = [];

// Every test gets its own directory: Bun caches a module by path for the whole process.
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-load-test-"));
  roots.push(dir);
  return dir;
}

const quiet = { out: () => {}, err: () => {} };

/** A world folder holding exactly these files, by path inside nuhokai/. */
function world(files: Record<string, string>): string {
  const root = tempDir();
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, "nuhokai", path)), { recursive: true });
    writeFileSync(join(root, "nuhokai", path), source);
  }
  return root;
}

/** packages/world/example as a repo's world: imports @nuhokai/world; the compile-time-only file stays out. */
function exampleWorld(): string {
  const files: Record<string, string> = {};
  for (const file of readdirSync(EXAMPLE)) {
    if (file.endsWith(".test.ts") || file === "type-errors.ts") continue;
    files[file] = readFileSync(join(EXAMPLE, file), "utf8").replaceAll('"../src/index.ts"', '"@nuhokai/world"');
  }
  return world(files);
}

/** A leaf's static fields, with the given id and ports. */
function leaf(id: string, ports = "{}"): string {
  return `{ id: "${id}", purpose: "${id} purpose", status: "planned", source: [], ports: ${ports} }`;
}

async function loadError(root: string): Promise<unknown> {
  try {
    await loadWorld(root);
  } catch (error) {
    return error;
  }
  throw new Error("loadWorld did not fail");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("after init, without node_modules, loads Example named by its export plus its placeholder", async () => {
  const repo = tempDir();
  expect(await runInit(repo, quiet)).toBe(0);
  // The init-written tsconfig maps @nuhokai/world to the .d.ts; evaluation must still get the CLI's runtime.
  writeFileSync(join(repo, "nuhokai/runtime.ts"), 'export { defineWorld } from "@nuhokai/world";\n');
  expect(existsSync(join(repo, "node_modules"))).toBe(false);

  const loaded = await loadWorld(repo);

  expect(readFileSync(join(repo, "nuhokai/index.ts"), "utf8")).toContain(`id: "${loaded.id}"`);
  expect(loaded.nodes).toEqual([
    {
      schema: "nuhokai/node@1",
      id: EXAMPLE_ID,
      name: "Example",
      parent: null,
      external: false,
      abstract: false,
      purpose: "An example to copy from; replace it with the first real node.",
      status: "planned",
      source: [],
      ports: [{ name: "greet", kind: "call", purpose: "Say hello", input: "a name", output: "a greeting" }],
    },
  ]);
  expect(loaded.placeholders).toEqual([
    { kind: "call", description: "Describe what this node has to do", users: [EXAMPLE_ID] },
  ]);
  // One runtime per process: the world files get the CLI's own runtime, not the init-written .d.ts.
  const runtime = await import(pathToFileURL(join(repo, "nuhokai/runtime.ts")).href);
  expect(runtime.defineWorld).toBe(defineWorld);
});

test("the example world: depth-first, edges grouped per target, delegates kept, inherited ports to the implementor", async () => {
  const loaded = await loadWorld(exampleWorld());
  const byName = Object.fromEntries(loaded.nodes.map((spec) => [spec.name, spec]));
  const id = (name: string) => byName[name]?.id ?? "";

  expect(loaded.nodes.map((spec) => [spec.name, spec.parent])).toEqual([
    ["Postgres", null],
    ["AuditLog", null],
    ["Shop", null],
    ["Orders", id("Shop")],
    ["Stock", id("Shop")],
  ]);
  expect(byName.Postgres).toMatchObject({ external: true, externalType: "db", status: "built" });
  expect(byName.AuditLog).toMatchObject({ abstract: true, requirements: [{ id: "R1" }] });
  expect(byName.Orders?.edges).toEqual([
    { kind: "uses", to: id("Stock"), port: ["reserve"] },
    { kind: "implements", to: id("AuditLog") },
  ]);
  expect(byName.Stock?.edges).toEqual([
    { kind: "uses", to: id("Orders"), port: ["cancelled"] },
    { kind: "uses", to: id("Postgres"), port: ["query"] },
  ]);
  expect(byName.Shop?.ports).toEqual([
    {
      name: "placeOrder",
      kind: "call",
      purpose: "Place an order",
      input: "cart lines",
      output: "order id",
      errors: ["out of stock"],
      delegate: { to: id("Orders"), port: "place" },
    },
    {
      name: "orderHistory",
      kind: "call",
      purpose: "Changes to an entity",
      input: "entity id",
      output: "change list",
      delegate: { to: id("Orders"), port: "history" },
    },
  ]);
  expect(byName.Shop?.edges).toBeUndefined();
  expect(loaded.placeholders).toEqual([
    {
      kind: "call",
      description: "Tell a customer that their order changed; channel (mail, push) not decided yet.",
      users: [id("Orders"), id("Stock")],
    },
  ]);
});

test("two ports of one target are one edge, a node listed twice appears once at its first listing", async () => {
  const root = world({
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { Box, Target } from "./box.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [Box, Target] });
`,
    "box.ts": `import { inherited, node } from "@nuhokai/world";
export const Contract = node({ ...${leaf("contract", '{ audit: { kind: "call", purpose: "audit" } }')}, abstract: true }).edges({});
export const Target = node({ ...${leaf("target", '{ one: { kind: "call", purpose: "one" }, two: { kind: "event", purpose: "two" } }')}, implements: () => [Contract] }).edges({});
export const User = node(${leaf("user")}).edges({
  uses: () => [Target.one, Target.two, Target.one, inherited(Target, Contract.audit)],
});
export const Box = node({
  id: "box", purpose: "box", status: "building", source: ["src/box/**"],
  children: { user: User, target: Target },
  ports: (c) => ({ run: c.target.ports.one }),
}).edges({});
`,
  });

  const loaded = await loadWorld(root);

  expect(loaded.nodes.map((spec) => [spec.name, spec.parent])).toEqual([
    ["Box", null],
    ["User", "box"],
    ["Target", "box"],
  ]);
  expect(loaded.nodes[1]?.edges).toEqual([{ kind: "uses", to: "target", port: ["one", "two", "audit"] }]);
  expect(loaded.nodes[2]?.edges).toEqual([{ kind: "implements", to: "contract" }]);
  expect(loaded.nodes[0]?.ports).toEqual([
    { name: "run", kind: "call", purpose: "one", delegate: { to: "target", port: "one" } },
  ]);
  expect(loaded.placeholders).toEqual([]);
});

test("a node listed at the top level and then inside a dome stays at its first listing", async () => {
  const root = world({
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { Box, Shared } from "./box.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [Shared, Box] });
`,
    "box.ts": `import { node } from "@nuhokai/world";
export const Shared = node(${leaf("shared")}).edges({});
export const Inner = node(${leaf("inner")}).edges({});
export const Box = node({ id: "box", purpose: "box", status: "planned", source: [], children: { shared: Shared, inner: Inner }, ports: () => ({}) }).edges({});
`,
  });

  const loaded = await loadWorld(root);

  expect(loaded.nodes.map((spec) => [spec.name, spec.parent])).toEqual([
    ["Shared", null],
    ["Box", null],
    ["Inner", "box"],
  ]);
});

test("parents: each node's parent by position, unambiguous when a child shares its dome's id", async () => {
  const root = world({
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { P, T } from "./p.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [P, T] });
`,
    "p.ts": `import { node } from "@nuhokai/world";
export const C1 = node(${leaf("x")}).edges({});
export const C2 = node(${leaf("c2")}).edges({});
export const T = node(${leaf("t")}).edges({});
export const P = node({ id: "x", purpose: "p", status: "planned", source: [], children: { c1: C1, c2: C2 }, ports: () => ({}) }).edges({});
`,
  });

  const loaded = await loadWorld(root);

  expect(loaded.nodes.map((spec) => spec.name)).toEqual(["P", "C1", "C2", "T"]);
  expect(loaded.parents).toEqual([null, 0, 0, null]);
});

test("a tbd used by two nodes is one placeholder with both ids and no edges", async () => {
  const root = world({
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { A, B } from "./nodes.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [B, A] });
`,
    "nodes.ts": `import { node, tbd } from "@nuhokai/world";
export const first = tbd.event({ description: "first hole" });
export const second = tbd.call({ description: "second hole" });
export const A = node(${leaf("a")}).edges({ uses: () => [second, first, second] });
export const B = node(${leaf("b")}).edges({ uses: () => [first] });
`,
  });

  const loaded = await loadWorld(root);

  expect(loaded.nodes.map((spec) => spec.edges)).toEqual([undefined, undefined]);
  expect(loaded.placeholders).toEqual([
    { kind: "event", description: "first hole", users: ["b", "a"] },
    { kind: "call", description: "second hole", users: ["a"] },
  ]);
});

test("names: the defining file's export, else the first export in sorted file order, else the id", async () => {
  const root = world({
    "a.ts": `export { Late as Early } from "./z.ts";\nimport { held } from "./z.ts";\nexport const First = held.Made;\n`,
    "b.ts": `import { held } from "./z.ts";\nexport const Second = held.Made;\n`,
    "index.ts": `import { defineWorld, node } from "@nuhokai/world";
import { First } from "./a.ts";
import { Late } from "./z.ts";
const Hidden = node(${leaf("hidden")}).edges({});
export default defineWorld({ id: "w", name: "w", source: [], children: [Late, First, Hidden] });
`,
    "z.ts": `import { node } from "@nuhokai/world";
export const Late = node(${leaf("late")}).edges({});
export const held = { Made: node(${leaf("made")}).edges({}) };
`,
  });

  const loaded = await loadWorld(root);

  // An alias re-export does not rename; a node its file does not export takes the first export.
  expect(loaded.nodes.map((spec) => spec.name)).toEqual(["Late", "First", "hidden"]);
});

test("a barrel re-export keeps the node's name and its file's blame", async () => {
  const root = world({
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { Bad } from "./zbad.ts";
export { Bad };
export default defineWorld({ id: "w", name: "w", source: [], children: [Bad] });
`,
    "zbad.ts": `import { node } from "@nuhokai/world";
export const Bad = node(${leaf("bad")}).edges({ uses: () => { throw new Error("boom"); } });
`,
  });

  expect(((await loadError(root)) as Error).message).toBe(`${root}/nuhokai/zbad.ts: Bad.uses: boom`);
});

test("a world that only loads is not judged: an orphan and an out-of-scope edge load", async () => {
  const root = world({
    "index.ts": `import { defineWorld, node } from "@nuhokai/world";
import { Inner, Outer } from "./nodes.ts";
export default defineWorld({ id: "w", name: "Shop", source: ["src/**"], children: [Outer, Outer] });
`,
    "nodes.ts": `import { node } from "@nuhokai/world";
export const Orphan = node(${leaf("orphan", '{ x: { kind: "call", purpose: "x" } }')}).edges({});
export const Inner = node(${leaf("same-id")}).edges({ uses: () => [Orphan.x] });
export const Outer = node({ id: "same-id", purpose: "o", status: "planned", source: [], children: { inner: Inner }, ports: () => ({}) }).edges({});
`,
  });

  const loaded = await loadWorld(root);

  expect(loaded.nodes.map((spec) => spec.name)).toEqual(["Outer", "Inner"]);
  expect(loaded.nodes[1]?.edges).toEqual([{ kind: "uses", to: "orphan", port: ["x"] }]);
  // What check judges: the world's name and source, every listing, the orphan, each node's file and line.
  expect([loaded.file, loaded.name, loaded.source]).toEqual([`${root}/nuhokai/index.ts`, "Shop", ["src/**"]]);
  expect(loaded.listings).toEqual([
    { node: "same-id", parent: null },
    { node: "same-id", parent: "same-id" },
    { node: "same-id", parent: null },
  ]);
  expect(loaded.orphans).toEqual([{ id: "orphan", name: "Orphan", file: `${root}/nuhokai/nodes.ts` }]);
  expect(loaded.files).toEqual([
    { node: "same-id", file: `${root}/nuhokai/nodes.ts`, line: 4 },
    { node: "same-id", file: `${root}/nuhokai/nodes.ts`, line: 3 },
  ]);
});

test("a world without a name or source still loads; both are absent, for check to judge", async () => {
  const root = world({
    "index.ts": `import { defineWorld, node } from "@nuhokai/world";
const A = node(${leaf("a")}).edges({});
export default defineWorld({ id: "w", children: [A] } as never);
`,
  });

  const loaded = await loadWorld(root);

  expect(loaded).not.toHaveProperty("name");
  expect(loaded).not.toHaveProperty("source");
  expect(loaded.files).toEqual([{ node: "a", file: `${root}/nuhokai/index.ts`, line: 2 }]);
});

test("every load failure is one CliError naming the file", async () => {
  const index = `import { defineWorld } from "@nuhokai/world";
import { A } from "./orders.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [A] });
`;
  const orders = `import { node } from "@nuhokai/world";\nexport const A = node(${leaf("a")}).edges({});\n`;
  const edges = (body: string) =>
    `import { node } from "@nuhokai/world";\nexport const A = node(${leaf("a")}).edges(${body} as never);\n`;
  const cases: [Record<string, string>, string][] = [
    [{ "orders.ts": orders }, "nuhokai/index.ts: not found"],
    [{ "index.ts": index, "orders.ts": `${orders}export const broken = ;\n` }, "nuhokai/orders.ts:3: Unexpected ;"],
    [
      { "index.ts": index, "orders.ts": `${orders}throw new Error("boom\\nhere");\n` },
      "nuhokai/orders.ts:3: boom here",
    ],
    [{ "index.ts": index, "orders.ts": orders, "sub/deep.ts": 'import "./gone.ts";\n' }, "nuhokai/sub/deep.ts: "],
    [{ "index.ts": "export default { children: [] };\n", "orders.ts": orders }, "nuhokai/index.ts: the default export"],
    [
      { "index.ts": 'export default { $ref: "world", children: [] };\n', "orders.ts": orders },
      "nuhokai/index.ts: the default export is not a world",
    ],
    [
      { "index.ts": index, "orders.ts": edges('{ uses: () => { throw new Error("lazy"); } }') },
      "nuhokai/orders.ts: A.uses: lazy",
    ],
    [
      { "index.ts": index, "orders.ts": edges("{ uses: () => 1 }") },
      "nuhokai/orders.ts: A.uses does not return a list",
    ],
    [
      { "index.ts": index, "orders.ts": edges("{ implements: () => ({}) }") },
      "nuhokai/orders.ts: A.implements does not",
    ],
    [
      {
        "index.ts": index,
        "orders.ts": `export { A } from "./sub/a.ts";\n`,
        "sub/a.ts": `${orders}export { pad } from "nuhokai-no-such-package";\n`,
      },
      "nuhokai/sub/a.ts: Cannot find package 'nuhokai-no-such-package'",
    ],
  ];

  for (const [files, prefix] of cases) {
    const root = world(files);
    const error = await loadError(root);
    expect(error, prefix).toBeInstanceOf(CliError);
    expect((error as Error).message).toStartWith(`${root}/${prefix}`);
    expect((error as Error).message).not.toContain("\n");
  }
});

test("a throwing file imported by an earlier one is named, not its importer", async () => {
  const root = world({
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { A } from "./z-throws.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [A] });
`,
    "z-throws.ts": 'throw new Error("from z");\nexport const A = 1;\n',
  });

  expect(((await loadError(root)) as Error).message).toBe(`${root}/nuhokai/z-throws.ts:1: from z`);
});

test("generated files, declarations and tests are never evaluated", async () => {
  const root = world({
    "index.ts": `import { defineWorld, node } from "@nuhokai/world";
export const A = node(${leaf("a")}).edges({});
export default defineWorld({ id: "w", name: "w", source: [], children: [A] });
`,
    ".generated/world/thrower.ts": 'throw new Error("generated");\n',
    "types.d.ts": "declare const x: number;\n",
    "a.test.ts": 'throw new Error("test");\n',
  });

  expect((await loadWorld(root)).nodes.map((spec) => spec.id)).toEqual(["a"]);
});

test("a symlinked node file is a node file: its export names the node", async () => {
  const root = world({
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { Shared } from "./linked.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [Shared] });
`,
  });
  mkdirSync(join(root, "shared"));
  writeFileSync(
    join(root, "shared/node.ts"),
    `import { node } from "@nuhokai/world";\nexport const Shared = node(${leaf("shared")}).edges({});\n`,
  );
  symlinkSync("../shared/node.ts", join(root, "nuhokai/linked.ts"));

  expect((await loadWorld(root)).nodes.map((spec) => spec.name)).toEqual(["Shared"]);
});

test("a symlink loop in nuhokai/ is walked once; a link that cannot resolve is a load error naming it", async () => {
  const files = {
    "index.ts": `import { defineWorld, node } from "@nuhokai/world";
export const A = node(${leaf("a")}).edges({});
export default defineWorld({ id: "w", name: "w", source: [], children: [A] });
`,
    "sub/b.ts": "export const b = 1;\n",
  };
  const root = world(files);
  symlinkSync(".", join(root, "nuhokai/loop"));
  symlinkSync("..", join(root, "nuhokai/sub/up"));
  expect((await loadWorld(root)).nodes.map((spec) => spec.name)).toEqual(["A"]);

  const selfLinked = world(files);
  symlinkSync("self", join(selfLinked, "nuhokai/self"));
  const error = await loadError(selfLinked);
  expect(error).toBeInstanceOf(CliError);
  expect((error as Error).message).toBe(`${selfLinked}/nuhokai/self: the symlink cannot be resolved (ELOOP)`);
});

test("the CLI under bun --no-install: an uncached package import is one load error, nothing installed", () => {
  // A real package, so a lost --no-install would install it; the project has no node_modules.
  const pkg = "is-positive";
  const cache = join(process.env.BUN_INSTALL_CACHE_DIR ?? join(homedir(), ".bun/install/cache"));
  const cached = () => (existsSync(cache) ? readdirSync(cache).filter((entry) => entry.startsWith(pkg)) : []);
  const before = cached();
  const repo = tempDir();
  expect(Bun.spawnSync([process.execPath, "--no-install", BIN, "init"], { cwd: repo }).exitCode).toBe(0);
  const example = join(repo, "nuhokai/example.ts");
  writeFileSync(example, `import positive from "${pkg}";\npositive;\n${readFileSync(example, "utf8")}`);

  const result = Bun.spawnSync([process.execPath, "--no-install", BIN, "map"], { cwd: repo });

  expect(result.exitCode).toBe(1);
  const lines = result.stderr.toString().trimEnd().split("\n");
  expect(lines).toHaveLength(1);
  expect(lines[0]).toStartWith("nuhokai map: nuhokai/example.ts");
  expect(lines[0]).toContain(pkg);
  expect(existsSync(join(repo, "node_modules"))).toBe(false);
  expect(cached()).toEqual(before);
});
