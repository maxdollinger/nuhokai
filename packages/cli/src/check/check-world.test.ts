import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

test("Check R1: after init, check reports no line, ok", async () => {
  expect(await check(await world())).toEqual({ outcome: "ok", out: [], err: [] });
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
    ],
    err: [],
  });
});

test("CheckWorld R4: no world, or a file at nuhokai, is LoadWorld's one line and TypeCheck never runs", async () => {
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

test("CheckWorld R1: a syntax error in a node file is its tsc error line, then one failure line, failed; SpecCheck never runs", async () => {
  const root = await world({ "nuhokai/broken.ts": "export const Broken = {;\n" });
  const spec = spyOn(specCheck, "applyRules");
  try {
    const report = await runCheck(root);
    const result = splitReport(report, root);
    expect(result.outcome).toBe("failed");
    // The tsc finding first, then the load failure: Cli prints the lines in this order.
    expect(report.lines.map((line) => line.kind)).toEqual(["result", "failure"]);
    expect(result.out).toEqual(["error: <root>/nuhokai/broken.ts:1: Property assignment expected."]);
    expect(result.err).toHaveLength(1);
    expect(result.err[0]).toStartWith("<root>/nuhokai/broken.ts");
    expect(spec).not.toHaveBeenCalled();
  } finally {
    spec.mockRestore();
  }
});

test("CheckWorld R2: a tsc error with a clean spec never runs CodeCheck; an orphan warning alone does, ok", async () => {
  const code = spyOn(codeCheck, "runCodeCheck");
  try {
    const typeError = await world({ "nuhokai/index.test.ts": 'export const x: number = "one";\n' });
    expect(await check(typeError)).toEqual({
      outcome: "failed",
      out: ["error: <root>/nuhokai/index.test.ts:1: Type 'string' is not assignable to type 'number'."],
      err: [],
    });
    expect(code).not.toHaveBeenCalled();

    const orphan = await world({ "nuhokai/orphan.ts": ORPHAN });
    expect(await check(orphan)).toEqual({
      outcome: "ok",
      out: [
        "warning: <root>/nuhokai/orphan.ts: Orphan: Orphan is exported but not reachable from the world; list it in a dome's children or in the world's (<root>/nuhokai/index.ts), or delete it",
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
    out: ["error: <root>/nuhokai/example.ts:3: Type '\"done\"' is not assignable to type 'NodeStatus'."],
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
  expect(result.out).toHaveLength(1);
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
