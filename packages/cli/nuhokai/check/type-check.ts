import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { WorldPath } from "../world-path.ts";

/** The world's type check, beside SpecCheck. */
export const TypeCheck = node({
  id: "01a186f7-93a5-7791-86db-5d2a7e555555",
  purpose: "Type-check the world files with the CLI's pinned checker and nuhokai/tsconfig.json.",
  status: "planned",
  source: ["src/check/type-check.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Type-check the project directory's world",
      input: "project directory, cwd-relative",
      output: "findings as Diagnostics.format takes them: one error per tsc error, at its file:line",
      errors: ["no nuhokai/tsconfig.json: says how to restore it"],
    },
  },
  requirements: [
    { id: "R1", text: "Every *.ts under nuhokai/, test files included, except .generated/." },
    {
      id: "R2",
      text: "World files are declarative: calls only to node, .edges, defineWorld, tbd.call, tbd.event and inherited; imports only @nuhokai/world and files under nuhokai/; no cast (as const aside), non-null assertion, any or @ts- directive. Anything else is an error at its line.",
    },
    {
      id: "R3",
      text: "Uses nuhokai/tsconfig.json; without it, one failure saying how to restore it, and no findings.",
    },
  ],
  testCases: [
    {
      text: "A type error in nuhokai/index.test.ts → one error; the same in nuhokai/.generated/x.ts → none.",
      demonstrates: ["R1"],
    },
    {
      text: "children: { a: Contract as any }, a @ts-expect-error line and Reflect.get(...) → three errors; a test file importing bun:test fails too.",
      demonstrates: ["R2"],
    },
  ],
}).edges({ uses: () => [WorldPath.file, Failure.format] });
