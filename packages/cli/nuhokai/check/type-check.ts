import { node } from "@nuhokai/world";

/** The world's type check, beside SpecCheck. */
export const TypeCheck = node({
  id: "01a186f7-93a5-7791-86db-5d2a7e555555",
  purpose: "Type-check the world files with the CLI's pinned checker and nuhokai/tsconfig.json.",
  status: "planned",
  source: [],
  ports: {
    run: {
      kind: "call",
      purpose: "Type-check the project directory's world",
      input: "project directory, cwd-relative",
      output: "findings: one per tsc error, at its file:line",
    },
  },
}).edges({});
