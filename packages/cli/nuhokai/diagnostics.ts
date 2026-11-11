import { node } from "@nuhokai/world";
import { Failure } from "./failure.ts";
import { Path } from "./path/path.ts";

/** The finding line check and review print. */
export const Diagnostics = node({
  id: "01a18319-8a0c-755d-855a-72794bb4cdf1",
  purpose:
    "Own the finding: built at its place, ordered one way, printed as lines a person or agent can act on alone, " +
    "and the summary under them. Shared by check and review.",
  status: "building",
  source: ["src/shared/diagnostics.ts", "src/shared/diagnostics.test.ts"],
  ports: {
    format: {
      kind: "call",
      purpose: "Turn findings into their lines",
      input: "findings: { severity: error | warning, file, line?, node?, rule, fix? }[]",
      output:
        "one line each, in order: '<severity>: <file>:<line>: <node>: <rule>; <fix>'; a missing line, node or fix drops its part; the file with control characters as spaces, other text fields flattened by Failure.format; identical lines merged into one ending in ' (×<n>)'",
      errors: [],
    },
    order: {
      kind: "call",
      purpose: "The one order of findings",
      input: "two findings",
      output:
        "file, then line, rule and node; plain code-unit order (Path.compareText), the same on every machine and locale",
      errors: [],
    },
    locate: {
      kind: "call",
      purpose: "A finding's place",
      input: "a place: a file and its line when known (a node, a listing, the world's defineWorld call)",
      output: "{ file, line? }",
      errors: [],
    },
    nodeError: {
      kind: "call",
      purpose: "Build an error about a node: at its node() line, named by its path",
      input: "a node (file, line?, path); the rule and fix",
      output: "the finding",
      errors: [],
    },
    summarize: {
      kind: "call",
      purpose: "The line that ends a list of findings",
      input: "the findings",
      output: "'<ok|failed>: <n> error(s), <n> warning(s)', counting every finding; failed when any is an error",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Each line is enough to act on alone: it names the broken rule, the node when the file defines one, and the fix when the rule has one.",
    },
    {
      id: "R2",
      text: "Each line points at a line of a file: a finding about a node or the world at its node() or defineWorld call, one about a source entry or a children item at that entry or item (when written in the same file), a tsc or load error at its token's line. Only a finding about a whole file (a missing index.ts, a tsconfig that does not parse) has none. No column: a line is enough for an editor or agent to jump to.",
    },
    {
      id: "R3",
      text: "Findings whose lines would be identical (three tsc errors on one line) print as one line at the first's place, ending in ' (×3)'; the summary still counts each finding.",
    },
    {
      id: "R4",
      text: "The file part loses only control characters (Failure.format's plain text), never whitespace, so a path with spaces opens as printed. The other parts are flattened to one line.",
    },
  ],
  testCases: [
    {
      text: "A file 'my  app/src/a.ts' followed by an escape sequence → printed with both spaces, the escape as a space; the rule's run of spaces as one.",
      demonstrates: ["R4"],
    },
    {
      text: "A multi-line tsc error in a file defining no node → one line 'error: nuhokai/x.ts:3: <message>', no node or fix part.",
      demonstrates: ["R1"],
    },
    {
      text: "An orphan exported from lost.ts line 3 → 'warning: nuhokai/lost.ts:3: Box: …'; a world source that is no list → 'error: nuhokai/index.ts:3: …', at defineWorld.",
      demonstrates: ["R2"],
    },
    {
      text: "No findings → 'ok: 0 errors, 0 warnings'; one warning → 'ok: 0 errors, 1 warning'; two errors → 'failed: 2 errors, 0 warnings'.",
      demonstrates: ["R1"],
    },
    {
      text: "Three findings with one rule on nuhokai/a.ts:2 (three tsc errors at different tokens), and another rule there → the other's line, then '…: <rule> (×3)'; summary 'failed: 4 errors, 0 warnings'.",
      demonstrates: ["R3"],
    },
  ],
  decisions: [
    {
      decision: "Top-level and shared: check's and review's findings are one line format and one summary.",
      why: "An agent or script that reads check's output reads review's too; two formats would drift.",
      rejected: [
        {
          option: "Stay inside Check, exposed through a Check port",
          why: "Review would depend on the check command for a line format.",
        },
      ],
    },
    {
      decision: "Lines carry no column; findings that would print the same line are merged and counted.",
      why: "Review findings have none, and one format for both commands beats a column check alone prints; the line is where an editor or agent jumps. Without the column, several tsc errors on one line would repeat one line word for word, so the line says how many it stands for.",
      rejected: [
        {
          option: "Keep the column for check",
          why: "Two line formats, for a detail an agent does not need to find the line.",
        },
        {
          option: "Print each finding, identical lines included",
          why: "Repeated lines read as a bug in the output and hide that the summary counts them all.",
        },
      ],
    },
  ],
}).edges({ uses: () => [Failure.format, Path.compareText] });
