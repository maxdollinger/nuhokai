import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { Inspect } from "../inspect.ts";
import { LoadWorld } from "../load-world.ts";
import { CodeCheck } from "./code-check.ts";
import { Diagnostics } from "./diagnostics.ts";
import { SpecCheck } from "./spec-check/spec-check.ts";
import { TypeCheck } from "./type-check.ts";

/** The program inside Check. */
export const CheckWorld = node({
  id: "01a18324-2010-73fa-aa04-aa55d61413ed",
  purpose: "Run TypeCheck beside loading the world once and running SpecCheck on it, then CodeCheck.",
  status: "planned",
  source: ["src/check/check-world.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Check the project directory's world",
      input: "project directory, cwd-relative",
      output:
        "exit 0 no errors (warnings allowed), 1 errors or failure; stdout: one line per diagnostic; stderr: one 'nuhokai check: ' line per failure",
      errors: ["no world at nuhokai/", "no nuhokai/tsconfig.json", "world failed to load"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "TypeCheck runs in parallel with load and SpecCheck, then CodeCheck. Output: TypeCheck's findings, then SpecCheck's, then CodeCheck's; a load failure ends the run after TypeCheck's findings.",
    },
    { id: "R2", text: "CodeCheck runs only when TypeCheck and SpecCheck found no errors." },
    {
      id: "R3",
      text: "A TypeCheck finding names its node only when the load succeeded and its file defines exactly one node.",
    },
  ],
  testCases: [
    {
      text: "A syntax error in a node file → its tsc error line, then one 'nuhokai check: ' stderr line, exit 1; SpecCheck never runs.",
      demonstrates: ["R1"],
    },
    {
      text: "A tsc error, spec clean → CodeCheck never runs; only an orphan warning → CodeCheck runs, exit 0.",
      demonstrates: ["R2"],
    },
  ],
}).edges({
  uses: () => [
    Inspect.requireWorld,
    TypeCheck.run,
    LoadWorld.load,
    SpecCheck.run,
    CodeCheck.run,
    Diagnostics.format,
    Failure.format,
    Failure.isExpected,
  ],
});
