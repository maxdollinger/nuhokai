import { node } from "@nuhokai/world";

/** Placeholder for the code check (MAX-23). */
export const CodeCheck = node({
  id: "01a18319-8a09-7487-a057-f38e1ccf9b50",
  purpose: "Check the code against the specs.",
  status: "planned",
  source: [],
  ports: {
    run: {
      kind: "call",
      purpose: "Judge the code against the loaded world; a stub that finds nothing for now",
      input: "the loaded world, as LoadWorld.load answers it",
      output: "findings: none yet",
    },
  },
}).edges({});
