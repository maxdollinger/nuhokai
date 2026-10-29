import { node } from "@nuhokai/world";
import { CheckWorld } from "./check-world.ts";
import { CodeCheck } from "./code-check.ts";
import { Diagnostics } from "./diagnostics.ts";
import { SpecCheck } from "./spec-check.ts";
import { TypeCheck } from "./type-check.ts";

/** `nuhokai check`. Inside: CheckWorld (program), TypeCheck (tsc), SpecCheck (spec rules), CodeCheck (planned), Diagnostics (shared by both). */
export const Check = node({
  id: "01a18319-89bb-7640-a85c-2a46040966af",
  purpose: "Ensure the specs follow the rules.",
  status: "planned",
  source: [],
  requirements: [
    {
      id: "R1",
      text: "One run reports every violation, not just the first, one line each.",
    },
  ],
  testCases: [
    {
      text: "After init: check prints nothing, exit 0. Two violations in different files → two stdout lines, exit 1. No world or a load failure → one 'nuhokai check: ' stderr line, exit 1.",
      demonstrates: ["R1"],
    },
  ],
  decisions: [
    {
      decision: "Children SpecCheck, CodeCheck and Diagnostics.",
      why: "Specific names read better on the map; Diagnostics are findings, Failure is thrown failures.",
    },
    {
      decision: "A program child, CheckWorld, exposes run; it loads once and runs SpecCheck and CodeCheck.",
      why: "Both checks need the loaded world, and loading belongs to neither.",
      rejected: [
        { option: "A run port per check on Check", why: "Each would load on its own; the caller would own the order." },
      ],
    },
    {
      decision: "TypeCheck is its own child; CheckWorld uses TypeCheck.run and SpecCheck.run.",
      why: "tsc errors are findings too, and running the checker is not judging the loaded world.",
      rejected: [{ option: "A tsc requirement on SpecCheck", why: "SpecCheck judges loaded data; tsc reads files." }],
    },
  ],
  children: {
    checkWorld: CheckWorld,
    typeCheck: TypeCheck,
    specCheck: SpecCheck,
    codeCheck: CodeCheck,
    diagnostics: Diagnostics,
  },
  ports: (c) => ({ run: c.checkWorld.ports.run }),
}).edges({});
