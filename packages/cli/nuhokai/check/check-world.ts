import { node } from "@nuhokai/world";
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
}).edges({ uses: () => [TypeCheck.run, SpecCheck.run] });
