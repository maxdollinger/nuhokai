import { node } from "@nuhokai/world";
import { DataRules } from "./data-rules.ts";
import { SourceRules } from "./source-rules.ts";

/** The program inside SpecCheck: the wiring of the two rule groups. */
export const ApplyRules = node({
  id: "01a188c9-49f6-71df-8840-816a2bd99c14",
  purpose: "Apply DataRules and SourceRules to the loaded world and put their findings in one order.",
  status: "built",
  source: ["src/check/spec-check/apply-rules.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Judge the loaded world against the spec rules",
      input: "project directory, cwd-relative; the loaded world, as LoadWorld.load answers it",
      output: "findings as Diagnostics.format takes them: one per violation",
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Findings sorted by file, line, rule, then node; the same world gives byte-identical output.",
    },
    { id: "R2", text: "A rule group that throws is a bug: it propagates, never a finding." },
  ],
}).edges({ uses: () => [DataRules.check, SourceRules.check] });
