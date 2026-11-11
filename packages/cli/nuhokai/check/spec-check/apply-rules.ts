import { node } from "@nuhokai/world";
import { Diagnostics } from "../../diagnostics.ts";
import { DataRules } from "./data-rules.ts";
import { SourceRules } from "./source-rules.ts";

/** The program inside SpecCheck: the wiring of the two rule groups. */
export const ApplyRules = node({
  id: "01a188c9-49f6-71df-8840-816a2bd99c14",
  purpose:
    "Apply DataRules and SourceRules to the loaded world and put their findings, with LoadWorld's shape problems, in one order.",
  status: "built",
  source: ["src/check/spec-check/apply-rules.ts", "src/check/spec-check/ids.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Judge the loaded world against the spec rules",
      input:
        "project directory, cwd-relative; the loaded world, as LoadWorld.load answers it; the files TypeCheck found an error in",
      output: "findings as Diagnostics.format takes them: one per violation",
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Findings sorted by file, line, rule, then node; the same world gives byte-identical output.",
    },
    { id: "R2", text: "A rule group that throws is a bug: it propagates, never a finding." },
    {
      id: "R3",
      text: "The loaded world's problems (LoadWorld R16) are findings beside the rules', except in a file TypeCheck found an error in: tsc has reported that break there, so it shows once.",
    },
  ],
  testCases: [
    {
      text: "requirements: 5 in a.ts and in b.ts, a TypeCheck error in a.ts → the problem in b.ts alone.",
      demonstrates: ["R3"],
    },
  ],
}).edges({ uses: () => [DataRules.check, SourceRules.check, Diagnostics.order] });
