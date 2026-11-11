import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runInit } from "../init/scaffold.ts";
import { CutShort } from "../shared/report.ts";
import { type SplitReport, splitReport } from "../shared/split-report.ts";
import { runCheck } from "./check-world.ts";
import * as codeCheck from "./code-check.ts";
import * as specCheck from "./spec-check/apply-rules.ts";
import * as typeCheck from "./type-check.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A world fresh from init, plus these files by path in the project directory. */
async function world(files: Record<string, string> = {}): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "nuhokai-check-test-"));
  roots.push(root);
  expect((await runInit(root)).outcome).toBe("ok");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/** Run check on the project directory, split as Cli would print it on stdout and stderr, the directory as <root>. */
async function check(root: string): Promise<SplitReport> {
  return splitReport(await runCheck(root), root);
}

const ORPHAN = `import { node } from "@nuhokai/world";

export const Orphan = node({ id: "orphan", purpose: "p", status: "planned", source: [] }).edges({});
`;

test("Check R1, CheckWorld R7: after init, check reports no finding, only its summary, ok", async () => {
  expect(await check(await world())).toEqual({ outcome: "ok", out: ["ok: 0 errors, 0 warnings"], err: [] });
});

test("Check R1: two violations in different files are two result lines, failed", async () => {
  const root = await world({
    "nuhokai/a.ts": `import { node } from "@nuhokai/world";

export const A = node({ id: "a", purpose: "p", status: "built", source: [] }).edges({});
`,
    "nuhokai/b.ts": `import { node } from "@nuhokai/world";

export const B = node({ id: "b", purpose: "p", status: "planned", source: ["src/gone.ts"] }).edges({});
`,
  });
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { A } from "./a.ts";
import { B } from "./b.ts";

export default defineWorld({ id: "w", name: "W", source: [], children: [A, B] });
`,
  );
  rmSync(join(root, "nuhokai/example.ts"));
  expect(await check(root)).toEqual({
    outcome: "failed",
    out: [
      'error: <root>/nuhokai/a.ts:3: A: a built node lists no source; list its code in source, e.g. ["src/orders/**"], or set its status to "planned"',
      'error: <root>/nuhokai/b.ts:3: B: source entry "src/gone.ts" matches no file; fix the path or glob, or drop the entry',
      "failed: 2 errors, 0 warnings",
    ],
    err: [],
  });
});

test("CheckWorld R4, R7: no world, or a file at nuhokai, is LoadWorld's one line, no summary, and TypeCheck never runs", async () => {
  const empty = mkdtempSync(join(tmpdir(), "nuhokai-check-test-"));
  const occupied = mkdtempSync(join(tmpdir(), "nuhokai-check-test-"));
  roots.push(empty, occupied);
  writeFileSync(join(occupied, "nuhokai"), "not a world");
  const types = spyOn(typeCheck, "runTypeCheck");
  try {
    expect(await check(empty)).toEqual({
      outcome: "failed",
      out: [],
      err: ["no nuhokai/ in <root>; run `nuhokai init --path <root>` to start a world there"],
    });
    expect(await check(occupied)).toEqual({
      outcome: "failed",
      out: [],
      err: ["<root>/nuhokai exists but is not a directory"],
    });
    expect(types).not.toHaveBeenCalled();
  } finally {
    types.mockRestore();
  }
});

test("CheckWorld R1, R6: a syntax error in a node file is one finding, as tsc and the loader word it alike, failed; SpecCheck never runs", async () => {
  const root = await world({ "nuhokai/broken.ts": "export const Broken = {;\n" });
  const spec = spyOn(specCheck, "applyRules");
  try {
    expect(await check(root)).toEqual({
      outcome: "failed",
      out: ["error: <root>/nuhokai/broken.ts:1: Property assignment expected.", "failed: 1 error, 0 warnings"],
      err: [],
    });
    expect(spec).not.toHaveBeenCalled();
  } finally {
    spec.mockRestore();
  }
});

test("CheckWorld R6: a world file the loader cannot read is an error finding on stdout, among tsc's in file order", async () => {
  const root = await world({
    "nuhokai/a.ts": 'export const bad: number = "one";\n',
    "nuhokai/b.ts": 'import { node } from "@nuhokai/world";\nexport const n = 1;\nif (n) {}\n',
  });
  expect(await check(root)).toEqual({
    outcome: "failed",
    out: [
      "error: <root>/nuhokai/a.ts:1: Type 'string' is not assignable to type 'number'.",
      "error: <root>/nuhokai/b.ts:3: world files hold only imports, exports and declarations of data, not an if statement: `if (n) {}`",
      "failed: 2 errors, 0 warnings",
    ],
    err: [],
  });
});

test("CheckWorld R6: a load error stays beside every tsc error, on its own line too; it is matched by nothing but identical words", async () => {
  const root = await world({
    "nuhokai/a.ts": 'export const wrong: number = "one";\nexport const n = 1;\nif (n) {}\n',
  });
  expect(await check(root)).toEqual({
    outcome: "failed",
    out: [
      "error: <root>/nuhokai/a.ts:1: Type 'string' is not assignable to type 'number'.",
      "error: <root>/nuhokai/a.ts:3: world files hold only imports, exports and declarations of data, not an if statement: `if (n) {}`",
      "failed: 2 errors, 0 warnings",
    ],
    err: [],
  });

  // The loader's "comes from" and R2's finding both point at the import: one break, two lines in their own words.
  const imported = await world({ "nuhokai/a.ts": 'import { pad } from "left-pad";\nexport const p = pad;\n' });
  expect((await check(imported)).out).toEqual([
    "error: <root>/nuhokai/a.ts:1: 'pad' comes from 'left-pad'; a world file reads only world files and @nuhokai/world",
    'error: <root>/nuhokai/a.ts:1: world files import only @nuhokai/world and files under nuhokai/, not "left-pad"; move what the import provides into the world, or drop the import',
    "failed: 2 errors, 0 warnings",
  ]);

  // A cast and a call on one line are two breaks: the cast's finding (with its fix) does not stand for the call.
  const castAndCall = await world();
  const example = join(castAndCall, "nuhokai/example.ts");
  writeFileSync(
    example,
    readFileSync(example, "utf8").replace('status: "planned",', 'status: "planned" as "planned", group: String(1),'),
  );
  const both = (await check(castAndCall)).out;
  expect(both).toHaveLength(3);
  // One line, so ordered by rule.
  expect(both[0]).toContain("not String(...)");
  expect(both[1]).toContain("world files use no cast");
  expect(both[2]).toBe("failed: 2 errors, 0 warnings");

  // A string spread into children from another file: tsc at `children:`, the loader at the spread.
  const spread = await world({ "nuhokai/kids.ts": 'export const kids = ["notanode"];\n' });
  const spreadIndex = join(spread, "nuhokai/index.ts");
  writeFileSync(
    spreadIndex,
    readFileSync(spreadIndex, "utf8")
      .replace("children: [Example]", "children: [Example, ...kids]")
      .replace(
        'import { Example } from "./example.ts";',
        'import { Example } from "./example.ts";\nimport { kids } from "./kids.ts";',
      ),
  );
  const spreadOut = (await check(spread)).out;
  expect(spreadOut).toHaveLength(3);
  expect(spreadOut.join("\n")).toContain("a child is a node reference, not a string");
  expect(spreadOut.join("\n")).toContain('item 2 is the string "notanode"');
  expect(spreadOut[2]).toBe("failed: 2 errors, 0 warnings");

  // A world re-exported from another file: its id's load error is at w.ts, beside tsc's there.
  const reExported = await world();
  const reIndex = join(reExported, "nuhokai/index.ts");
  writeFileSync(
    join(reExported, "nuhokai/w.ts"),
    readFileSync(reIndex, "utf8").replace(/ {2}id: "[^"]*",/, "  id: 5,"),
  );
  writeFileSync(reIndex, 'export { default } from "./w.ts";\n');
  expect((await check(reExported)).out).toEqual([
    "error: <root>/nuhokai/w.ts:6: Type 'number' is not assignable to type 'string'.",
    "error: <root>/nuhokai/w.ts:6: the world's id is not a string; keep the id init gave it, or give it a fresh UUID",
    "failed: 2 errors, 0 warnings",
  ]);

  const notAList = await world();
  const index = join(notAList, "nuhokai/index.ts");
  writeFileSync(index, readFileSync(index, "utf8").replace("children: [Example]", "children: Example"));
  const notAListOut = (await check(notAList)).out;
  expect(notAListOut).toHaveLength(3);
  expect(notAListOut[0]).toStartWith("error: <root>/nuhokai/index.ts:10: Type 'NodeHandle' is not assignable");
  expect(notAListOut[1]).toBe(
    "error: <root>/nuhokai/index.ts:10: the world's children is not a list of nodes: children: [A, B]",
  );
  expect(notAListOut[2]).toBe("failed: 2 errors, 0 warnings");
});

test("CheckWorld R6: a load error on the line of a message the format wrote stays beside it; DataRules R4 waits for tsc too", async () => {
  const root = await world();
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    `import { defineWorld, node } from "@nuhokai/world";
import { Example } from "./example.ts";
const Draft = node({ id: "d", purpose: "p", status: "planned", source: [] });
export default defineWorld({ id: "w", name: " ", source: [], children: [Example, Draft] });
`,
  );
  expect(await check(root)).toEqual({
    outcome: "failed",
    out: [
      "error: <root>/nuhokai/index.ts:4: a draft is not a node: call .edges(), also with {}",
      "error: <root>/nuhokai/index.ts:4: name must not be empty or whitespace: give the world a name, e.g. Shop",
      "error: <root>/nuhokai/index.ts:4: the world's children list a value that is not a node: item 2 is a draft: node(...) without .edges(...); list nodes made by node(...).edges(...), e.g. children: [A, B]",
      "failed: 3 errors, 0 warnings",
    ],
    err: [],
  });
});

test("DataRules R4 waits only for a tsc error in the world file: a blank name tsc cannot see still shows beside one elsewhere", async () => {
  const root = await world();
  const index = join(root, "nuhokai/index.ts");
  writeFileSync(
    index,
    readFileSync(index, "utf8")
      .replace(/ {2}name: .*\n/, "  name: blank,\n")
      .replace("/** The world", 'const blank: string = "  ";\n\n/** The world'),
  );
  const example = join(root, "nuhokai/example.ts");
  writeFileSync(example, readFileSync(example, "utf8").replace('status: "planned"', 'status: "plannd"'));
  const result = await check(root);
  expect(result.out).toHaveLength(3);
  expect(result.out[0]).toStartWith("error: <root>/nuhokai/example.ts:");
  expect(result.out[0]).toContain(`Type '"plannd"' is not assignable to type 'NodeStatus'.`);
  expect(result.out[1]).toStartWith("error: <root>/nuhokai/index.ts:");
  expect(result.out[1]).toContain("the world's name is blank; give defineWorld a name");
  expect(result.out[2]).toBe("failed: 2 errors, 0 warnings");
});

test("CheckWorld R2: a tsc error with a clean spec never runs CodeCheck; an orphan warning alone does, ok", async () => {
  const code = spyOn(codeCheck, "runCodeCheck");
  try {
    const typeError = await world({ "nuhokai/index.test.ts": 'export const x: number = "one";\n' });
    expect(await check(typeError)).toEqual({
      outcome: "failed",
      out: [
        "error: <root>/nuhokai/index.test.ts:1: Type 'string' is not assignable to type 'number'.",
        "failed: 1 error, 0 warnings",
      ],
      err: [],
    });
    expect(code).not.toHaveBeenCalled();

    const orphan = await world({ "nuhokai/orphan.ts": ORPHAN });
    expect(await check(orphan)).toEqual({
      outcome: "ok",
      out: [
        "warning: <root>/nuhokai/orphan.ts:3: Orphan: exported but not reachable from the world; list it in a dome's children or in the world's (<root>/nuhokai/index.ts), or delete it",
        "ok: 0 errors, 1 warning",
      ],
      err: [],
    });
    expect(code).toHaveBeenCalledTimes(1);
  } finally {
    code.mockRestore();
  }
});

test("a bug in SpecCheck crashes check as a CutShort carrying the tsc findings already answered", async () => {
  const root = await world({ "nuhokai/index.test.ts": 'export const x: number = "one";\n' });
  const bug = new TypeError("boom");
  const spec = spyOn(specCheck, "applyRules").mockImplementation(() => {
    throw bug;
  });
  try {
    const thrown = await runCheck(root).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(CutShort);
    const cut = thrown as CutShort;
    expect(cut.bug).toBe(bug);
    expect(splitReport({ outcome: "failed", lines: cut.lines }, root).out).toEqual([
      "error: <root>/nuhokai/index.test.ts:1: Type 'string' is not assignable to type 'number'.",
    ]);
  } finally {
    spec.mockRestore();
  }
});

test("CheckWorld R3: a tsc finding names its node when its file defines exactly one", async () => {
  const root = await world();
  writeFileSync(
    join(root, "nuhokai/example.ts"),
    `import { node } from "@nuhokai/world";

export const Example = node({ id: "e", purpose: "p", source: [], status: "done" }).edges({});
`,
  );
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { Example } from "./example.ts";

export default defineWorld({ id: "w", name: "W", source: [], children: [Example] });
export const wrong: number = "one";
`,
  );
  const result = await check(root);
  expect(result.outcome).toBe("failed");
  expect(result.out).toEqual([
    "error: <root>/nuhokai/example.ts:3: Example: Type '\"done\"' is not assignable to type 'NodeStatus'.",
    "error: <root>/nuhokai/index.ts:5: Type 'string' is not assignable to type 'number'.",
    "failed: 2 errors, 0 warnings",
  ]);
});

test("CheckWorld R3: no node is named for a file that defines two nodes", async () => {
  const root = await world();
  writeFileSync(
    join(root, "nuhokai/example.ts"),
    `import { node } from "@nuhokai/world";

export const Example = node({ id: "e", purpose: "p", source: [], status: "done" }).edges({});
export const Other = node({ id: "o", purpose: "p", source: [], status: "planned" }).edges({});
`,
  );
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { Example, Other } from "./example.ts";

export default defineWorld({ id: "w", name: "W", source: [], children: [Example, Other] });
`,
  );
  expect(await check(root)).toEqual({
    outcome: "failed",
    out: [
      "error: <root>/nuhokai/example.ts:3: Type '\"done\"' is not assignable to type 'NodeStatus'.",
      "failed: 1 error, 0 warnings",
    ],
    err: [],
  });
});

test("CheckWorld R3: an orphan counts as a node its file defines", async () => {
  const root = await world();
  writeFileSync(
    join(root, "nuhokai/example.ts"),
    `import { node } from "@nuhokai/world";

export const Example = node({ id: "e", purpose: "p", source: [], status: "done" }).edges({});
export const Orphan = node({ id: "o", purpose: "p", source: [], status: "planned" }).edges({});
`,
  );
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    `import { defineWorld } from "@nuhokai/world";
import { Example } from "./example.ts";

export default defineWorld({ id: "w", name: "W", source: [], children: [Example] });
`,
  );
  const result = await check(root);
  expect(result.out).toContain(
    "error: <root>/nuhokai/example.ts:3: Type '\"done\"' is not assignable to type 'NodeStatus'.",
  );
});

test("CheckWorld R3: a node is named by its path even when a sibling shares its dome's id", async () => {
  const root = await world();
  writeFileSync(
    join(root, "nuhokai/c2.ts"),
    `import { node } from "@nuhokai/world";

export const C2 = node({ id: "c2", purpose: "p", source: [], status: "done" }).edges({});
`,
  );
  writeFileSync(
    join(root, "nuhokai/index.ts"),
    `import { defineWorld, node } from "@nuhokai/world";
import { C2 } from "./c2.ts";

export const C1 = node({ id: "x", purpose: "p", source: [], status: "planned" }).edges({});
export const P = node({ id: "x", purpose: "p", source: [], status: "planned", children: [C1, C2], ports: {} }).edges({});
export default defineWorld({ id: "w", name: "W", source: [], children: [P] });
`,
  );
  const result = await check(root);
  expect(result.out).toContain(
    "error: <root>/nuhokai/c2.ts:3: P/C2: Type '\"done\"' is not assignable to type 'NodeStatus'.",
  );
});

test("a missing nuhokai/tsconfig.json is a failure saying how to restore it; the spec findings are still reported", async () => {
  const root = await world({ "nuhokai/orphan.ts": ORPHAN });
  rmSync(join(root, "nuhokai/tsconfig.json"));
  const result = await check(root);
  expect(result.outcome).toBe("failed");
  // The orphan's warning, then the summary: no error found, failed all the same, the failure on stderr says why.
  expect(result.out).toHaveLength(2);
  expect(result.out[1]).toBe("failed: 0 errors, 1 warning");
  expect(result.err).toEqual([
    "<root>/nuhokai/tsconfig.json: not found; it is CLI-owned: copy it from a fresh `nuhokai init`",
  ]);
});

test("CheckWorld R5: after a type error SpecCheck leaves out R5, so an external child is reported once, by tsc", async () => {
  const root = await world({
    "nuhokai/bad.ts": `import { node } from "@nuhokai/world";
export const Ext = node({ id: "ext", external: true, purpose: "e", status: "built", source: [] }).edges({});
export const Dome = node({ id: "dome", purpose: "d", status: "planned", source: [], children: [Ext] }).edges({});
`,
    "nuhokai/index.ts": `import { defineWorld } from "@nuhokai/world";
import { Dome } from "./bad.ts";
export default defineWorld({ id: "w", name: "W", source: [], children: [Dome] });
`,
  });

  const result = await check(root);

  // init's Example, no longer listed, is an orphan warning; the one error is tsc's.
  const errors = result.out.filter((line) => line.startsWith("error:"));
  expect(result.outcome).toBe("failed");
  expect(errors).toHaveLength(1);
  expect(errors[0]).toStartWith("error: <root>/nuhokai/bad.ts:3: ");
  expect(errors[0]).toContain("external nodes are top level only");
});

test("LoadWorld R16: a source that is no list is reported once, by tsc: no shape problem, no missing source", async () => {
  const root = await world({
    "nuhokai/a.ts": `import { node } from "@nuhokai/world";
export const A = node({ id: "a", purpose: "p", status: "built", source: "src/**" }).edges({});
`,
    "nuhokai/index.ts": `import { defineWorld } from "@nuhokai/world";
import { A } from "./a.ts";
export default defineWorld({ id: "w", name: "W", source: [], children: [A] });
`,
  });

  const result = await check(root);
  const errors = result.out.filter((line) => line.startsWith("error: <root>/nuhokai/a.ts"));

  // tsc's error alone: no "source is not a list" beside it, and no "a built node lists no source".
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("not assignable");
  expect(result.outcome).toBe("failed");
});
