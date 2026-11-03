import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { LoadWorld } from "../load-world.ts";
import { Path } from "../path/path.ts";
import { CodeCheck } from "./code-check.ts";
import { Diagnostics } from "./diagnostics.ts";
import { SpecCheck } from "./spec-check/spec-check.ts";
import { TypeCheck } from "./type-check.ts";

/** The program inside Check: load, then TypeCheck beside SpecCheck, then CodeCheck. */
export const CheckWorld = node({
  id: "01a18324-2010-73fa-aa04-aa55d61413ed",
  purpose: "Load the world once, run TypeCheck, then SpecCheck on it, then CodeCheck.",
  status: "built",
  source: ["src/check/check-world.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Check the project directory's world",
      input: "project directory, cwd-relative",
      output:
        "Report: ok without errors (warnings allowed), else failed; one result line per diagnostic and one failure line per failure, in the order they happen",
      errors: ["no world at nuhokai/ (LoadWorld's NoWorldError)", "no nuhokai/tsconfig.json", "world failed to load"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Order: load; then TypeCheck; then SpecCheck; then CodeCheck. A load failure other than NoWorldError still runs TypeCheck, and ends the run after its findings. Output: TypeCheck's findings, then SpecCheck's, then CodeCheck's.",
    },
    { id: "R2", text: "CodeCheck runs only when TypeCheck and SpecCheck found no errors." },
    {
      id: "R3",
      text: "A TypeCheck finding names its node only when the load succeeded and its file defines exactly one node.",
    },
    {
      id: "R4",
      text: "LoadWorld's NoWorldError ends the run before TypeCheck starts: no world → one failure line naming init, never a second one from TypeCheck.",
    },
    {
      id: "R5",
      text: "After a TypeCheck error, SpecCheck runs without its R5 (tsc's rules re-checked on the loaded data), so one break is never reported twice; a TypeCheck failure without findings leaves R5 in.",
    },
  ],
  testCases: [
    {
      text: "A syntax error in a node file → its tsc error line, then one failure line, failed; SpecCheck never runs.",
      demonstrates: ["R1"],
    },
    {
      text: "A tsc error, spec clean → CodeCheck never runs; only an orphan warning → CodeCheck runs, ok.",
      demonstrates: ["R2"],
    },
    {
      text: "No nuhokai/, or a file there → one failure line, naming init when absent, failed; TypeCheck never runs.",
      demonstrates: ["R4"],
    },
    {
      text: "A dome with a literal external child → one error, tsc's; SpecCheck's own 'external node is not at the top level' stays out.",
      demonstrates: ["R5"],
    },
  ],
  decisions: [
    {
      decision:
        "Load first; TypeCheck and SpecCheck run on its outcome, TypeCheck even when the load fails, and SpecCheck after TypeCheck, so it knows whether tsc found an error.",
      why: "The program reads in its natural order and needs no guard of its own: LoadWorld's NoWorldError says when nothing is there to check. A world that fails to load still gets all of tsc's findings, which the load, stopping at its first unreadable value, cannot give. TypeCheck starts after the load; SpecCheck, a few milliseconds of work, waits for it.",
      rejected: [
        {
          option: "Inspect.requireWorld, then TypeCheck beside load and SpecCheck",
          why: "A second guard next to LoadWorld's own, needed only because the no-world failure was not told apart.",
        },
        { option: "Stop at any load failure", why: "Hides tsc's findings exactly when the world is broken." },
      ],
    },
  ],
}).edges({
  uses: () => [
    TypeCheck.run,
    LoadWorld.load,
    SpecCheck.run,
    CodeCheck.run,
    Diagnostics.format,
    Failure.format,
    Failure.isExpected,
    Path.nameNodes,
  ],
});
