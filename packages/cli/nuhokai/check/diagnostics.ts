import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";

/** Shared by the checks. */
export const Diagnostics = node({
  id: "01a18319-8a0c-755d-855a-72794bb4cdf1",
  purpose:
    "Own the finding: build one at its place, order them one way, and turn each into a line a human or agent can act on without opening the world.",
  status: "built",
  source: ["src/check/diagnostics.ts"],
  ports: {
    format: {
      kind: "call",
      purpose: "Turn one finding into its line",
      input: "finding: { severity: error | warning, file, line?, column?, node?, rule, fix? }",
      output:
        "one line, '<severity>: <file>:<line>:<column>: <node>: <rule>; <fix>'; a missing line, column, node or fix drops its part; text fields flattened by Failure.format",
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
  },
  requirements: [
    {
      id: "R1",
      text: "Each line is enough to act on alone: it names the broken rule, the node when the file defines one, and the fix when the rule has one.",
    },
    {
      id: "R2",
      text: "Each line points at the code: every finding about a node or the world carries the line and column of its node() or defineWorld call, one about a source entry or a children item those of that entry or item (when written in the same file), a tsc or load error those of the token it is about, so two findings on one line stay apart and an editor or agent jumps straight there. Only a finding about a whole file (a missing index.ts, a tsconfig that does not parse) has none.",
    },
  ],
  testCases: [
    {
      text: "A multi-line tsc error in a file defining no node → one line 'error: nuhokai/x.ts:3: <message>', no node or fix part.",
      demonstrates: ["R1"],
    },
    {
      text: "An orphan exported from lost.ts line 3 → 'warning: nuhokai/lost.ts:3:20: Box: …'; a world source that is no list → 'error: nuhokai/index.ts:3:16: …', at defineWorld.",
      demonstrates: ["R2"],
    },
  ],
}).edges({ uses: () => [Failure.format] });
