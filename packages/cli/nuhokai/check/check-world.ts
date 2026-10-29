import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { Inspect } from "../inspect.ts";
import { LoadWorld } from "../load-world.ts";
import { CodeCheck } from "./code-check.ts";
import { SpecCheck } from "./spec-check.ts";
import { TypeCheck } from "./type-check.ts";

/** The program inside Check. */
export const CheckWorld = node({
  id: "01a18324-2010-73fa-aa04-aa55d61413ed",
  purpose: "Run TypeCheck, load the world once, then run SpecCheck and CodeCheck on it.",
  status: "planned",
  source: [],
  ports: {
    run: {
      kind: "call",
      purpose: "Check the project directory's world",
      input: "project directory, cwd-relative",
      output:
        "exit 0 no violations, 1 diagnostics or failure; stdout: one line per diagnostic; stderr: one 'nuhokai check: ' line per failure",
      errors: ["no world at nuhokai/", "world failed to load"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Order: TypeCheck, load, SpecCheck, CodeCheck. A load failure ends the run; TypeCheck's findings print before the failure line.",
    },
  ],
}).edges({
  uses: () => [
    Inspect.requireWorld,
    TypeCheck.run,
    LoadWorld.load,
    SpecCheck.run,
    CodeCheck.run,
    Failure.format,
    Failure.isExpected,
  ],
});
