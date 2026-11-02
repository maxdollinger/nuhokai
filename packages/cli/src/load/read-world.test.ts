import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { writeCliFiles } from "../init/cli-files.ts";
import { loadWorld } from "./load-world.ts";
import { readWorld } from "./read-world.ts";

// PROTOTYPE: readWorld answers what loadWorld answers, without running a world file.

const PACKAGES = join(import.meta.dir, "../../..");
const EXAMPLE = join(PACKAGES, "world/example");
const roots: string[] = [];

/** A world folder holding these files, by path inside nuhokai/, plus the CLI's tsconfig and declarations. */
function world(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "nuhokai-read-test-"));
  roots.push(root);
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, "nuhokai", path)), { recursive: true });
    writeFileSync(join(root, "nuhokai", path), source);
  }
  writeCliFiles(root);
  return root;
}

function leaf(id: string, ports = "{}"): string {
  return `{ id: "${id}", purpose: "${id} purpose", status: "planned", source: [], ports: ${ports} }`;
}

async function readError(root: string): Promise<string> {
  try {
    await readWorld(root);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("readWorld did not fail");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("the same LoadedWorld as loadWorld: the CLI's world, the world package's and the example world", async () => {
  const example: Record<string, string> = {};
  for (const file of readdirSync(EXAMPLE)) {
    if (file.endsWith(".test.ts") || file === "type-errors.ts") continue;
    example[file] = readFileSync(join(EXAMPLE, file), "utf8").replaceAll('"../src/index.ts"', '"@nuhokai/world"');
  }

  for (const root of [join(PACKAGES, "cli"), join(PACKAGES, "world"), world(example)]) {
    const read = await readWorld(root);
    // toStrictEqual ignores key order; the JSON compares it too, as the map embeds it.
    expect(read).toStrictEqual(await loadWorld(root));
    expect(JSON.stringify(read)).toBe(JSON.stringify(await loadWorld(root)));
  }
});

test("runs nothing: an import cycle through a dome reads in any order, and a throwing statement never throws", async () => {
  const files = {
    "cmd/a-leaf.ts": `import { node } from "@nuhokai/world";
import { Caller } from "../z-caller.ts";
export const Leaf = node(${leaf("leaf", '{ run: { kind: "call", purpose: "run" } }')}).edges({ uses: () => [Caller.print] });
`,
    "cmd/cmd.ts": `import { node } from "@nuhokai/world";
import { Leaf } from "./a-leaf.ts";
export const Cmd = node({ id: "cmd", purpose: "cmd", status: "planned", source: [], children: () => ({ leaf: Leaf }), ports: (c) => ({ run: c.leaf.ports.run }) }).edges({});
`,
    "z-caller.ts": `import { node } from "@nuhokai/world";
import { Cmd } from "./cmd/cmd.ts";
export const Caller = node(${leaf("caller", '{ print: { kind: "call", purpose: "print" } }')}).edges({ uses: () => [Cmd.run] });
throw new Error("never runs");
`,
    "index.ts": `import { defineWorld } from "@nuhokai/world";
import { Leaf } from "./cmd/a-leaf.ts";
import { Cmd } from "./cmd/cmd.ts";
import { Caller } from "./z-caller.ts";
export { Leaf };
export default defineWorld({ id: "w", name: "w", source: [], children: [Cmd, Caller] });
`,
  };

  const read = await readWorld(world(files));

  expect(read.nodes.map((spec) => spec.name)).toEqual(["Cmd", "Leaf", "Caller"]);
  expect(read.nodes[0]?.ports).toEqual([
    { name: "run", kind: "call", purpose: "run", delegate: { to: "leaf", port: "run" } },
  ]);
  expect(read.nodes[2]?.edges).toEqual([{ kind: "uses", to: "cmd", port: ["run"] }]);
});

test("what it cannot read is one CliError at its file and line", async () => {
  const index = (body: string) => `import { defineWorld, node } from "@nuhokai/world";
${body}
export default defineWorld({ id: "w", name: "w", source: [], children: [A] });
`;
  const cases: [string, string][] = [
    [index("export const A = ;"), "nuhokai/index.ts:2: Expression expected."],
    [
      index(`export const A = node(${leaf("a")}).edges({ uses: () => { const x = []; return x; } });`),
      "nuhokai/index.ts:2: a function here is an expression or one return",
    ],
    [index(`export const A = node({ ...${leaf("a")}, purpose: String(1) }).edges({});`), "nuhokai/index.ts:2: "],
    [
      index(
        `const B = node(${leaf("b", '{ run: { kind: "call", purpose: "run" } }')}).edges({});\nexport const A = node({ id: "a", purpose: "a", status: "planned", source: [], children: () => ({ b: B }), ports: (c) => ({ run: c.bb.ports.run }) }).edges({});`,
      ),
      "nuhokai/index.ts:3: `bb` is not one of this dome's children",
    ],
  ];

  for (const [source, prefix] of cases) {
    const root = world({ "index.ts": source });
    expect(await readError(root)).toStartWith(`${root}/${prefix}`);
  }
});
