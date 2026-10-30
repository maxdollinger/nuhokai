import { node } from "@nuhokai/world";

/** The code check, a stub until MAX-23 designs it. */
export const CodeCheck = node({
  id: "01a18319-8a09-7487-a057-f38e1ccf9b50",
  purpose: "Check the code against the specs.",
  status: "planned",
  source: ["src/check/code-check.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Judge the code against the loaded world; a stub that finds nothing until MAX-23",
      input: "the loaded world, as LoadWorld.load answers it",
      output: "findings as Diagnostics.format takes them: none yet",
    },
  },
}).edges({});
