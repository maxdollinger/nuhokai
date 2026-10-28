import { node } from "@nuhokai/world";
import { CodeCheck } from "./code-check.ts";
import { Diagnostics } from "./diagnostics.ts";
import { SpecCheck } from "./spec-check.ts";

/** `nuhokai check`. Inside: SpecCheck (spec rules), CodeCheck (planned), Diagnostics (shared by both). */
export const Check = node({
  id: "01a18319-89bb-7640-a85c-2a46040966af",
  purpose: "Ensure the specs follow the rules.",
  status: "planned",
  source: [],
  requirements: [
    {
      id: "R1",
      text: "One run reports every violation, not just the first, one line each: file:line, node name, one sentence.",
    },
  ],
  decisions: [
    {
      decision: "Children SpecCheck, CodeCheck and Diagnostics.",
      why: "Names are unique world-wide, so generic ones clash; Diagnostics are findings, Failure is thrown failures.",
    },
  ],
  children: { specCheck: SpecCheck, codeCheck: CodeCheck, diagnostics: Diagnostics },
}).edges({});
