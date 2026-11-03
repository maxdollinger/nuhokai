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
import { writeCliFiles } from "../init/cli-files.ts";
import { runInit } from "../init/scaffold.ts";
import { CliError } from "../shared/failure.ts";
import { NoWorldError } from "../shared/inspect.ts";
import { type LoadedWorld, loadWorld } from "./load-world.ts";

/** Each loaded node's NodeSpec, in nodes order. */
const specs = (world: LoadedWorld) => world.nodes.map((node) => node.spec);

/** Where each loaded node sits and is defined: its id, path, parent and children by position, file and line. */
const places = (world: LoadedWorld) =>
  world.nodes.map(({ spec, path, parent, children, file, line }) => ({
    id: spec.id,
    path,
    parent,
    children,
    file,
    line,
  }));

const EXAMPLE = join(import.meta.dir, "../../../world/example");
const BIN = join(import.meta.dir, "../bin.ts");
const EXAMPLE_ID = "01a17290-3f10-7c54-8e51-0b63d9f2a7c4";
const roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-load-test-"));
  roots.push(dir);
  return dir;
}

/** A world folder holding these files, by path inside nuhokai/, plus the CLI-owned tsconfig and declarations. */
function world(files: Record<string, string>): string {
  const root = tempDir();
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, "nuhokai", path)), { recursive: true });
    writeFileSync(join(root, "nuhokai", path), source);
  }
  writeCliFiles(root);
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

test("no nuhokai/, or a file there, is one NoWorldError and nothing is read; a missing index.ts is no NoWorldError", async () => {
  const empty = tempDir();
  const absent = await loadError(empty);
  expect(absent).toBeInstanceOf(NoWorldError);
  expect((absent as Error).message).toBe(
    `no nuhokai/ in ${empty}; run \`nuhokai init --path ${empty}\` to start a world there`,
  );

  const occupied = tempDir();
  writeFileSync(join(occupied, "nuhokai"), "not a world");
  const blocked = await loadError(occupied);
  expect(blocked).toBeInstanceOf(NoWorldError);
  expect((blocked as Error).message).toBe(`${occupied}/nuhokai exists but is not a directory`);

  const indexless = world({ "a.ts": "export const a = 1;\n" });
  const missing = await loadError(indexless);
  expect(missing).toBeInstanceOf(CliError);
  expect(missing).not.toBeInstanceOf(NoWorldError);
});

test("after init, without node_modules, loads Example named by its export plus its placeholder", async () => {
  const repo = tempDir();
  expect((await runInit(repo)).outcome).toBe("ok");
  expect(existsSync(join(repo, "node_modules"))).toBe(false);

  const loaded = await loadWorld(repo);

  expect(readFileSync(join(repo, "nuhokai/index.ts"), "utf8")).toContain(`id: "${loaded.id}"`);
  expect(specs(loaded)).toEqual([
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
    { kind: "call", description: "Describe what this node has to do", name: "later", users: [EXAMPLE_ID] },
  ]);
});

test("the example world: depth-first, edges grouped per target, delegates kept, inherited ports to the implementor", async () => {
  const loaded = await loadWorld(exampleWorld());
  const byName = Object.fromEntries(specs(loaded).map((spec) => [spec.name, spec]));
  const id = (name: string) => byName[name]?.id ?? "";

  expect(specs(loaded).map((spec) => [spec.name, spec.parent])).toEqual([
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
      name: "notifyCustomer",
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
  children: [User, Target],
  ports: { run: Target.one },
}).edges({});
`,
  });

  const loaded = await loadWorld(root);

  expect(specs(loaded).map((spec) => [spec.name, spec.parent])).toEqual([
    ["Box", null],
    ["User", "box"],
    ["Target", "box"],
  ]);
  expect(loaded.nodes[1]?.spec.edges).toEqual([{ kind: "uses", to: "target", port: ["one", "two", "audit"] }]);
  expect(loaded.nodes[2]?.spec.edges).toEqual([{ kind: "implements", to: "contract" }]);
  expect(loaded.nodes[0]?.spec.ports).toEqual([
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
export const Box = node({ id: "box", purpose: "box", status: "planned", source: [], children: [Shared, Inner], ports: {} }).edges({});
`,
  });

  const loaded = await loadWorld(root);

  expect(specs(loaded).map((spec) => [spec.name, spec.parent])).toEqual([
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
export const P = node({ id: "x", purpose: "p", status: "planned", source: [], children: [C1, C2], ports: {} }).edges({});
`,
  });

  const loaded = await loadWorld(root);

  expect(specs(loaded).map((spec) => spec.name)).toEqual(["P", "C1", "C2", "T"]);
  expect(places(loaded)).toMatchObject([
    { path: "P", parent: null, children: [1, 2] },
    { path: "P/C1", parent: 0, children: [] },
    { path: "P/C2", parent: 0, children: [] },
    { path: "T", parent: null, children: [] },
  ]);
  expect(loaded.top).toEqual([0, 3]);
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

  expect(specs(loaded).map((spec) => spec.edges)).toEqual([undefined, undefined]);
  expect(loaded.placeholders).toEqual([
    { kind: "event", description: "first hole", name: "first", users: ["b", "a"] },
    { kind: "call", description: "second hole", name: "second", users: ["a"] },
  ]);
});

test("a tbd is named by its defining file's export, not an earlier alias; an inline one has no name", async () => {
  const root = world({
    "a.ts": `export { hole as alias } from "./holes.ts";\n`,
    "holes.ts": `import { tbd } from "@nuhokai/world";\nexport const hole = tbd.call({ description: "exported" });\n`,
    "index.ts": `import { defineWorld, node, tbd } from "@nuhokai/world";
import { hole } from "./holes.ts";
const A = node(${leaf("a")}).edges({ uses: () => [hole, tbd.event({ description: "inline" })] });
export default defineWorld({ id: "w", name: "w", source: [], children: [A] });
`,
  });

  const loaded = await loadWorld(root);

  expect(loaded.placeholders).toEqual([
    { kind: "call", description: "exported", name: "hole", users: ["a"] },
    { kind: "event", description: "inline", users: ["a"] },
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
  expect(specs(loaded).map((spec) => spec.name)).toEqual(["Late", "First", "hidden"]);
});

test("a barrel re-export keeps the node's name and its file's blame", async () => {
  const root = world({
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { Bad } from "./zbad.ts";
export { Bad };
export default defineWorld({ id: "w", name: "w", source: [], children: [Bad] });
`,
    "zbad.ts": `import { node } from "@nuhokai/world";
export const Bad = node(${leaf("bad")}).edges({ uses: () => 1 } as never);
`,
  });

  expect(((await loadError(root)) as Error).message).toBe(`${root}/nuhokai/zbad.ts: Bad.uses does not return a list`);
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
export const Outer = node({ id: "same-id", purpose: "o", status: "planned", source: [], children: [Inner], ports: {} }).edges({});
`,
  });

  const loaded = await loadWorld(root);

  expect(specs(loaded).map((spec) => spec.name)).toEqual(["Outer", "Inner"]);
  expect(loaded.nodes[1]?.spec.edges).toEqual([{ kind: "uses", to: "orphan", port: ["x"] }]);
  // What check judges: the world's name and source, every listing, the orphan, each node's file and line.
  expect([loaded.file, loaded.name, loaded.source]).toEqual([`${root}/nuhokai/index.ts`, "Shop", ["src/**"]]);
  expect(loaded.listings).toEqual([
    { node: "same-id", parent: null },
    { node: "same-id", parent: "same-id" },
    { node: "same-id", parent: null },
  ]);
  expect(loaded.orphans).toEqual([{ id: "orphan", name: "Orphan", file: `${root}/nuhokai/nodes.ts` }]);
  expect(places(loaded).map(({ id, file, line }) => ({ id, file, line }))).toEqual([
    { id: "same-id", file: `${root}/nuhokai/nodes.ts`, line: 4 },
    { id: "same-id", file: `${root}/nuhokai/nodes.ts`, line: 3 },
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
  expect(places(loaded)).toEqual([
    { id: "a", path: "a", parent: null, children: [], file: `${root}/nuhokai/index.ts`, line: 2 },
  ]);
});

test("every load failure is one CliError naming the file, and its line where it points at code", async () => {
  const index = `import { defineWorld } from "@nuhokai/world";
import { A } from "./orders.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [A] });
`;
  const orders = `import { node } from "@nuhokai/world";\nexport const A = node(${leaf("a")}).edges({});\n`;
  const edges = (body: string) =>
    `import { node } from "@nuhokai/world";\nexport const A = node(${leaf("a")}).edges(${body} as never);\n`;
  const cases: [Record<string, string>, string][] = [
    [{ "orders.ts": orders }, "nuhokai/index.ts: not found"],
    [
      { "index.ts": index, "orders.ts": `${orders}export const broken = ;\n` },
      "nuhokai/orders.ts:3: Expression expected.",
    ],
    [{ "index.ts": "export default { children: [] };\n", "orders.ts": orders }, "nuhokai/index.ts: the default export"],
    [
      { "index.ts": 'export default { $ref: "world", children: [] };\n', "orders.ts": orders },
      "nuhokai/index.ts: the default export is not a world",
    ],
    [
      { "index.ts": index, "orders.ts": edges('{ uses: () => { throw new Error("lazy"); } }') },
      "nuhokai/orders.ts:2: a function here is an expression or one return",
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
        "sub/a.ts": `import { node } from "@nuhokai/world";\nimport { pad } from "nuhokai-no-such-package";\nexport const A = node({ ...${leaf("a")}, purpose: pad }).edges({});\n`,
      },
      "nuhokai/sub/a.ts:3: 'pad' comes from 'nuhokai-no-such-package'; a world file reads only world files and @nuhokai/world",
    ],
    [
      {
        "index.ts": index,
        "orders.ts": `import { node } from "@nuhokai/world";\nexport const A = node({ ...${leaf("a")}, purpose: String(1) }).edges({});\n`,
      },
      "nuhokai/orders.ts:2: ",
    ],
    [
      {
        "index.ts": index,
        "orders.ts": `import { node } from "@nuhokai/world";\nimport { gone } from "./gone.ts";\nexport const A = node({ ...${leaf("a")}, purpose: gone }).edges({});\n`,
      },
      "nuhokai/orders.ts:3: 'gone' refers to nothing",
    ],
    [
      { "index.ts": index, "orders.ts": `${orders}throw new Error("never runs");\n` },
      "nuhokai/orders.ts:3: world files hold only imports, exports and declarations of data, not a ThrowStatement",
    ],
    [
      { "index.ts": index, "orders.ts": `${orders}const unused = Date.now();\n` },
      "nuhokai/orders.ts:3: world files are declarative: they call only node, .edges, defineWorld, tbd.call, tbd.event and inherited, not Date.now(...)",
    ],
    [
      {
        "index.ts": index,
        "orders.ts": `${orders}export const Lost = node(${leaf("lost")}).edges({ uses: () => { const x = [A.x]; return x; } });\n`,
      },
      "nuhokai/orders.ts:3: a function here is an expression or one return",
    ],
    [
      {
        "index.ts": index,
        "orders.ts": `import { node as n } from "@nuhokai/world";\nexport const A = n(${leaf("a")}).edges({});\n`,
      },
      "nuhokai/orders.ts:2: 'n': import node, defineWorld, inherited and tbd from @nuhokai/world under their own name",
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

/** A dome Cmd whose child Leaf (sorted first, so evaluated first) uses Caller, which uses Cmd: an import cycle through the dome. */
const CYCLE = {
  "cmd/a-leaf.ts": `import { node } from "@nuhokai/world";
import { Caller } from "../z-caller.ts";
export const Leaf = node(${leaf("leaf", '{ run: { kind: "call", purpose: "run" } }')}).edges({ uses: () => [Caller.print] });
`,
  "cmd/cmd.ts": `import { node } from "@nuhokai/world";
import { Leaf } from "./a-leaf.ts";
export const Cmd = node({ id: "cmd", purpose: "cmd", status: "planned", source: [], children: [Leaf], ports: { run: Leaf.run } }).edges({});
`,
  "z-caller.ts": `import { node } from "@nuhokai/world";
import { Cmd } from "./cmd/cmd.ts";
export const Caller = node(${leaf("caller", '{ print: { kind: "call", purpose: "print" } }')}).edges({ uses: () => [Cmd.run] });
`,
};

test("nothing runs: an import cycle through a dome loads in any import order", async () => {
  const index = (imports: string) => `import { defineWorld } from "@nuhokai/world";
${imports}
export default defineWorld({ id: "w", name: "w", source: [], children: [Cmd, Caller] });
`;
  const viaDome = index('import { Cmd } from "./cmd/cmd.ts";\nimport { Caller } from "./z-caller.ts";');
  const viaChild = index(
    'import { Leaf } from "./cmd/a-leaf.ts";\nimport { Cmd } from "./cmd/cmd.ts";\nimport { Caller } from "./z-caller.ts";\nexport { Leaf };',
  );

  for (const source of [viaDome, viaChild]) {
    const root = world({ ...CYCLE, "index.ts": source });

    const loaded = await loadWorld(root);

    expect(specs(loaded).map((spec) => spec.name)).toEqual(["Cmd", "Leaf", "Caller"]);
    expect(loaded.nodes[0]?.spec.ports).toEqual([
      { name: "run", kind: "call", purpose: "run", delegate: { to: "leaf", port: "run" } },
    ]);
  }
});

test("a dome port of a non-child or a missing port is one load error at the dome's node() line, listed or not", async () => {
  const dome = (ports: string) => `import { node } from "@nuhokai/world";
import { Leaf, Other } from "./leaf.ts";
export const Dome = node({ id: "dome", purpose: "d", status: "planned", source: [], children: [Leaf], ports: ${ports} }).edges({});
`;
  const files = (domeSource: string) => ({
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { Dome } from "./dome.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [Dome] });
`,
    "dome.ts": domeSource,
    "leaf.ts": `import { node } from "@nuhokai/world";
export const Leaf = node(${leaf("leaf", '{ run: { kind: "call", purpose: "run" } }')}).edges({});
export const Other = node(${leaf("other", '{ run: { kind: "call", purpose: "run" } }')}).edges({});
`,
  });
  const cases: [string, string][] = [
    ["{ run: Other.run }", "`run` exposes a port of a node that is not one of this dome's direct children"],
    ["{ run: Leaf.nope }", "`nope` is not a port of its node"],
  ];

  for (const [ports, message] of cases) {
    const root = world(files(dome(ports)));
    expect(((await loadError(root)) as Error).message).toBe(`${root}/nuhokai/dome.ts:3: ${message}`);
  }

  // The same dome listed nowhere, an orphan: still read whole, still the same error.
  const orphaned = world({
    ...files(dome("{ run: Other.run }")),
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { Leaf } from "./leaf.ts";
export default defineWorld({ id: "w", name: "w", source: [], children: [Leaf] });
`,
  });
  expect(((await loadError(orphaned)) as Error).message).toBe(
    `${orphaned}/nuhokai/dome.ts:3: \`run\` exposes a port of a node that is not one of this dome's direct children`,
  );
});

test("generated files, declarations and tests are never read", async () => {
  const root = world({
    "index.ts": `import { defineWorld, node } from "@nuhokai/world";
export const A = node(${leaf("a")}).edges({});
export default defineWorld({ id: "w", name: "w", source: [], children: [A] });
`,
    ".generated/world/thrower.ts": 'throw new Error("generated");\n',
    "types.d.ts": "declare const x: number;\n",
    "a.test.ts": 'throw new Error("test");\n',
  });

  expect(specs(await loadWorld(root)).map((spec) => spec.id)).toEqual(["a"]);
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

  expect(specs(await loadWorld(root)).map((spec) => spec.name)).toEqual(["Shared"]);
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
  expect(specs(await loadWorld(root)).map((spec) => spec.name)).toEqual(["A"]);

  const selfLinked = world(files);
  symlinkSync("self", join(selfLinked, "nuhokai/self"));
  const error = await loadError(selfLinked);
  expect(error).toBeInstanceOf(CliError);
  expect((error as Error).message).toBe(`${selfLinked}/nuhokai/self: the symlink cannot be resolved (ELOOP)`);
});

test("the CLI: a world file using a package is one load error naming it; nothing is installed or run", () => {
  // A real package, so installing or running it would leave a trace; the project has no node_modules.
  const pkg = "is-positive";
  const cache = join(process.env.BUN_INSTALL_CACHE_DIR ?? join(homedir(), ".bun/install/cache"));
  const cached = () => (existsSync(cache) ? readdirSync(cache).filter((entry) => entry.startsWith(pkg)) : []);
  const before = cached();
  const repo = tempDir();
  expect(Bun.spawnSync([process.execPath, "--no-install", BIN, "init"], { cwd: repo }).exitCode).toBe(0);
  const example = join(repo, "nuhokai/example.ts");
  const source = readFileSync(example, "utf8").replace(/purpose: "[^"]*"/, "purpose: positive");
  writeFileSync(example, `import positive from "${pkg}";\n${source}`);

  const result = Bun.spawnSync([process.execPath, "--no-install", BIN, "map"], { cwd: repo });

  expect(result.exitCode).toBe(1);
  const lines = result.stderr.toString().trimEnd().split("\n");
  expect(lines).toHaveLength(1);
  expect(lines[0]).toStartWith("nuhokai map: nuhokai/example.ts:");
  expect(lines[0]).toContain(`'positive' comes from '${pkg}'`);
  expect(existsSync(join(repo, "node_modules"))).toBe(false);
  expect(cached()).toEqual(before);
});
