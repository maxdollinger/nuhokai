import { node } from "@nuhokai/world";

/** The program inside SpecCheck: the wiring of the three rule groups. */
export const ApplyRules = node({
  id: "01a188c9-49f6-71df-8840-816a2bd99c14",
  purpose:
    "Index the loaded world once, apply DataRules, FormatRules and SourceRules, and put their findings in one order.",
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
}).edges({});
