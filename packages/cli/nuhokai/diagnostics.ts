import { node } from "@nuhokai/world";
import { Failure } from "./failure.ts";

/** The finding line check and review print. */
export const Diagnostics = node({
  id: "01a18319-8a0c-755d-855a-72794bb4cdf1",
  purpose:
    "Own the finding: built at its place, ordered one way, printed as one line a person or agent can act on alone, " +
    "and the summary under them. Shared by check and review.",
  status: "building",
  source: ["src/shared/diagnostics.ts", "src/shared/diagnostics.test.ts"],
  ports: {
    format: {
      kind: "call",
      purpose: "Turn one finding into its line",
      input: "finding: { severity: error | warning, file, line?, node?, rule, fix? }",
      output:
        "one line, '<severity>: <file>:<line>: <node>: <rule>; <fix>'; a missing line, node or fix drops its part; text fields flattened by Failure.format",
      errors: [],
    },
    order: {
      kind: "call",
      purpose: "The one order of findings, and of the names they sort by",
      input: "two findings, or two texts",
      output: "file, then line, rule and node; plain code-unit order, the same on every machine and locale",
      errors: [],
    },
    locate: {
      kind: "call",
      purpose: "Build a finding at a place: an error about a node at its node() line, named by its path",
      input: "a node (file, line?, path), or a file and line; the rule and fix",
      output: "the finding",
      errors: [],
    },
    summarize: {
      kind: "call",
      purpose: "The line that ends a list of findings",
      input: "the findings",
      output: "'<ok|failed>: <n> error(s), <n> warning(s)'; failed when any is an error",
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
  ],
  testCases: [
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
      decision: "Lines carry no column.",
      why: "Review findings have none, and one format for both commands beats a column check alone prints; the line is where an editor or agent jumps.",
      rejected: [
        {
          option: "Keep the column for check",
          why: "Two line formats; two findings on one line still differ in rule and node.",
        },
      ],
    },
  ],
}).edges({ uses: () => [Failure.format] });
