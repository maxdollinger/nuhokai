import { expect, test } from "bun:test";
import { renderPrompt } from "./prompt-text.ts";
import type { Scope } from "./review-scope.ts";

/** PrintTree's scope as ReviewScope gives it under the cwd, cut to what the prompt shows. */
const PRINT_TREE: Scope = {
  node: "Tree/PrintTree",
  specFile: "nuhokai/tree/print-tree.ts",
  items: [
    { ref: "purpose", kind: "purpose", text: "The program inside Tree.", file: "nuhokai/tree/print-tree.ts", line: 10 },
    {
      ref: "requirements[R1]",
      kind: "requirement",
      text: "Order: load, find the start, render, report.",
      file: "nuhokai/tree/print-tree.ts",
      line: 30,
    },
    {
      ref: "requirements[R4]",
      kind: "requirement",
      text: "Untested.",
      file: "nuhokai/tree/print-tree.ts",
      line: 40,
      untested: true,
    },
    {
      ref: "Store.requirements[R1]",
      kind: "requirement",
      text: "Keeps.",
      file: "nuhokai/store.ts",
      line: 7,
      contract: "Store",
    },
  ],
  files: ["src/tree/print-tree.test.ts", "src/tree/print-tree.ts"],
  uses: [
    { path: "LoadWorld", ports: ["load"], source: ["src/load/**"], purpose: "Read nuhokai/.", external: false },
    { path: "Terminal", ports: ["print"], source: [], purpose: "Whoever runs nuhokai.", external: true },
  ],
  drafts: [],
};

/** The index of the first line containing `text`; the test fails if none does. */
function lineOf(lines: readonly string[], text: string): number {
  const index = lines.findIndex((line) => line.includes(text));
  if (index === -1) throw new Error(`no line with ${text}`);
  return index;
}

test("R1, R3: check first, the node, each item at file:line, the files, the dependencies, the JSON, submit last", () => {
  const lines = renderPrompt(".", PRINT_TREE);
  const order = [
    lineOf(lines, "Run `nuhokai check`. If it fails, stop"),
    lineOf(lines, "Tree/PrintTree, specified in nuhokai/tree/print-tree.ts."),
    lineOf(lines, "- requirements[R1] (nuhokai/tree/print-tree.ts:30; requirement): Order: load"),
    lineOf(lines, "- src/tree/print-tree.test.ts"),
    lineOf(lines, "- src/tree/print-tree.ts"),
    lineOf(lines, "- LoadWorld: load (source src/load/**): Read nuhokai/."),
    lineOf(lines, "## 6. Drafts"),
    lineOf(lines, "- against-spec:"),
    lineOf(lines, '{"node":"Tree/PrintTree","reviewedFiles":'),
    lineOf(lines, "`nuhokai review --submit`"),
  ];
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(lines.at(-1)).toContain("Pipe the JSON to `nuhokai review --submit`");
  expect(lines).toContain("- Terminal: print (external: known by name and purpose alone): Whoever runs nuhokai.");
  expect(lines).toContain(
    "- requirements[R4] (nuhokai/tree/print-tree.ts:40; requirement): Untested. [untested: no test case demonstrates it]",
  );
  expect(lines).toContain("- Store.requirements[R1] (nuhokai/store.ts:7; requirement, inherited from Store): Keeps.");

  const under = renderPrompt("packages/cli", PRINT_TREE);
  expect(under.at(-1)).toContain("`nuhokai review --submit --path packages/cli`");
  expect(under).toContain(
    "Run `nuhokai check --path packages/cli`. If it fails, stop and report its output instead of reviewing: the spec is not valid yet.",
  );
});

test("R2: a draft is listed with its description and marked not to review against", () => {
  const lines = renderPrompt(".", { ...PRINT_TREE, drafts: [{ description: "Describe it", name: "later" }] });
  const drafts = lineOf(lines, "## 6. Drafts");
  expect(lines[drafts + 2]).toContain("may still change. Do not review against them");
  expect(lines[drafts + 4]).toBe("- later: Describe it");
  expect(renderPrompt(".", PRINT_TREE)).toContain("The node uses no draft.");
});

test("R4, R5: text from world files is one line, control characters as spaces; the same scope renders the same", () => {
  const scope: Scope = {
    ...PRINT_TREE,
    items: [{ ref: "purpose", kind: "purpose", text: "Two\u001b[31m\nlines", file: "nuhokai/a.ts", line: 3 }],
  };
  const lines = renderPrompt(".", scope);
  expect(lines).toContain("- purpose (nuhokai/a.ts:3; purpose): Two [31m lines");
  expect(lines.some((line) => line.includes("\u001b") || line.includes("\n"))).toBe(false);
  expect(renderPrompt(".", scope)).toEqual(lines);
});
