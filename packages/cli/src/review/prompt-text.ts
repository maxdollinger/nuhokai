/** The review prompt's wording: a review's scope as the instructions a coding agent follows. Pure. */
import { oneLine } from "../shared/failure.ts";
import { suggestedCommand } from "../shared/world-path.ts";
import type { Scope } from "./review-scope.ts";
import type { SpecItem } from "./spec-items.ts";

/** A spec item as one prompt line: reference, where it is written, kind and text, each on one line (R4). */
function itemLine(item: SpecItem): string {
  const at = item.line === undefined ? item.file : `${item.file}:${item.line}`;
  const from = item.contract === undefined ? "" : `, inherited from ${oneLine(item.contract)}`;
  const gap = item.untested ? " [untested: no test case demonstrates it]" : "";
  return `- ${oneLine(item.ref)} (${oneLine(at)}; ${item.kind}${from}): ${oneLine(item.text)}${gap}`;
}

/**
 * The prompt for a review of `scope` in the project directory `root` (named from the cwd), as lines, in order (R1):
 * check first, the node and its spec file, every spec item, the files, the allowed dependencies, the drafts (R2),
 * the categories and verdicts, the JSON to answer with, and the submit command, spelled to run as printed (R3). Text
 * from world files is one line each (R4); the same scope and directory give the same lines (R5).
 */
export function renderPrompt(root: string, scope: Scope): string[] {
  const node = oneLine(scope.node);
  const submit = suggestedCommand("review", ["--submit"], root);
  const firstFile = scope.files.find((file) => !file.includes(".test.")) ?? scope.files[0] ?? "src/x.ts";
  const firstItem = scope.items.find((item) => item.kind === "requirement")?.ref ?? "purpose";
  const example = {
    node: scope.node,
    reviewedFiles: scope.files,
    findings: [
      { category: "against-spec", specItem: firstItem, file: firstFile, line: 1, evidence: "what the code does" },
    ],
  };
  return [
    `# Review ${node} against its spec`,
    "",
    `You review whether the code of ${node} does what its spec says. Conformance only: report where the code goes against an item of the spec, not general bugs or style.`,
    "",
    "## 1. Check first",
    "",
    `Run ${suggestedCommand("check", [], root)}. If it fails, stop and report its output instead of reviewing: the spec is not valid yet.`,
    "",
    "## 2. The node",
    "",
    `${node}, specified in ${oneLine(scope.specFile)}.`,
    "",
    "## 3. The spec items",
    "",
    "Hold the code against every item. Cite an item by its reference, exactly as written before the parenthesis. An item marked untested is a requirement no test case demonstrates: check the code all the more carefully.",
    "",
    ...scope.items.map(itemLine),
    "",
    "## 4. The files to read",
    "",
    "Read each of them whole; these are the node's code and tests.",
    "",
    ...scope.files.map((file) => `- ${oneLine(file)}`),
    "",
    "## 5. The allowed dependencies",
    "",
    ...(scope.uses.length === 0
      ? ["The spec lists no uses edge: the code depends on no other node of the world."]
      : [
          "The code may use these nodes' ports, and no other node of the world: using another is against the spec's uses edges.",
          "",
          ...scope.uses.map((use) => {
            const source = use.external
              ? "external: known by name and purpose alone"
              : use.source.length === 0
                ? "no source yet"
                : `source ${use.source.map(oneLine).join(", ")}`;
            return `- ${oneLine(use.path)}: ${use.ports.map(oneLine).join(", ")} (${source}): ${oneLine(use.purpose)}`;
          }),
        ]),
    "",
    "## 6. Drafts",
    "",
    ...(scope.drafts.length === 0
      ? ["The node uses no draft."]
      : [
          "These dependencies are drafts: not designed yet, and they may still change. Do not review against them: neither code using them nor their absence is a finding.",
          "",
          ...scope.drafts.map(
            (draft) => `- ${draft.name === undefined ? "" : `${oneLine(draft.name)}: `}${oneLine(draft.description)}`,
          ),
        ]),
    "",
    "## 7. Categories and verdicts",
    "",
    "- against-spec: the code clearly contradicts the cited spec item. An error: the review fails.",
    "- possibly-against-spec: the code may contradict the cited spec item, but you are not sure. A warning.",
    "- unspecified: the code does something no spec item covers, worth adding to the spec. A warning; cite no item.",
    "No findings means the code passes. Report each problem once, at the line where it is.",
    "",
    "## 8. Your answer",
    "",
    "Answer with one JSON object and no other keys:",
    "- node: the node's path, as above.",
    "- reviewedFiles: every file you read, at least each file of section 4, as listed there.",
    "- findings: a list, empty when the code passes. Each finding has category, specItem (a reference from section 3; left out for unspecified), file (a file of section 4, or a spec file of section 3), line (a whole number from 1, within that file) and evidence (what the code does and why it goes against the item; not blank).",
    "",
    "For example:",
    "",
    JSON.stringify(example),
    "",
    "## 9. Submit",
    "",
    `Pipe the JSON to ${submit}, e.g. with a heredoc. It prints one line per finding and a summary, and exits 0 when the review passes, 1 when it has an against-spec finding, and 2 when the submission is invalid: then each problem is one line on stderr; fix them and submit again.`,
  ];
}
