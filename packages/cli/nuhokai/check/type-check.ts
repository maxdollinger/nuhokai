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
      output: "findings as Diagnostics.format takes them: one error per tsc error, at its file:line",
    },
  },
  requirements: [
    { id: "R1", text: "Every *.ts under nuhokai/, test files included, except .generated/." },
    {
      id: "R2",
      text: "World files, *.test.ts aside, contain no cast, non-null assertion, explicit any or @ts- directive; each is an error at its line.",
    },
  ],
  testCases: [
    {
      text: "A type error in nuhokai/index.test.ts → one error; the same in nuhokai/.generated/x.ts → none.",
      demonstrates: ["R1"],
    },
    {
      text: "children: { a: Contract as any } and a @ts-expect-error line → two errors; the same cast in index.test.ts → none.",
      demonstrates: ["R2"],
    },
  ],
}).edges({});
