import { node } from "@nuhokai/world";
import { DataRules } from "./data-rules.ts";
import { FormatRules } from "./format-rules.ts";
import { SourceRules } from "./source-rules.ts";

/** The program inside SpecCheck: the wiring of the three rule groups. */
export const ApplyRules = node({
  id: "01a188c9-49f6-71df-8840-816a2bd99c14",
  purpose: "Apply DataRules, FormatRules and SourceRules to the loaded world and put their findings in one order.",
  status: "planned",
  source: [],
  ports: {
    run: {
      kind: "call",
      purpose: "Judge the loaded world against the spec rules",
      input: "project directory, cwd-relative; the loaded world, as LoadWorld.load answers it",
      output: "findings as Diagnostics.format takes them: one per violation",
    },
  },
}).edges({ uses: () => [DataRules.check, FormatRules.check, SourceRules.check] });
