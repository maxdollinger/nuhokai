import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";

/** Shared by the checks. */
export const Diagnostics = node({
  id: "01a18319-8a0c-755d-855a-72794bb4cdf1",
  purpose: "Turn findings into lines a human or agent can act on without opening the world.",
  status: "planned",
  source: [],
  ports: {
    format: {
      kind: "call",
      purpose: "Turn one finding into its line",
      input: "finding: { severity: error | warning, file, line?, node?, rule, fix? }",
      output:
        "one line, '<severity>: <file>:<line>: <node>: <rule>; <fix>'; a missing line, node or fix drops its part; text fields flattened by Failure.format",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Each line is enough to act on alone: it names the broken rule, the node when the file defines one, and the fix when the rule has one.",
    },
  ],
}).edges({ uses: () => [Failure.format] });
