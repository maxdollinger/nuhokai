import { node } from "@nuhokai/world";

/** The tsc rules again, on loaded data: R5. */
export const FormatRules = node({
  id: "01a188c9-4a0a-73fb-8feb-2c1cba15dcb1",
  purpose: "Catch what casts and suppressed errors slip past tsc.",
  status: "planned",
  source: [],
  ports: {
    check: {
      kind: "call",
      purpose: "Judge the tsc rules on loaded data",
      input: "the loaded world, as LoadWorld.load answers it",
      output: "findings as Diagnostics.format takes them",
    },
  },
}).edges({});
