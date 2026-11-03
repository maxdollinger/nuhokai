import { node } from "@nuhokai/world";
import { FileSystem } from "../externals/file-system.ts";
import { Tsgo } from "../externals/tsgo.ts";
import { Failure } from "../failure.ts";
import { Path } from "../path/path.ts";

/** The world's type check, beside SpecCheck. */
export const TypeCheck = node({
  id: "01a186f7-93a5-7791-86db-5d2a7e555555",
  purpose: "Type-check the world files with the CLI's pinned checker and nuhokai/tsconfig.json.",
  status: "built",
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
      text: "Nothing in a world file bypasses or widens the type check: imports only @nuhokai/world and files under nuhokai/, so it never depends on the repo's packages; no cast (as const aside), non-null assertion, any or @ts- directive, so every tsc rule holds. Each breach is an error at its line. Whether a file is data is LoadWorld's to judge, not R2's.",
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
      text: "children: [Contract as any] and a @ts-expect-error line → two errors, Reflect.get(...) none (LoadWorld's); a test file importing bun:test fails too.",
      demonstrates: ["R2"],
    },
  ],
  decisions: [
    {
      decision:
        "R2 keeps only what the type check needs: imports, casts, !, any and @ts- directives. Calls and other code are LoadWorld's.",
      why: "LoadWorld reads every world file and fails on what is not data, so it is the one definition of declarative; two definitions disagreed (a ?: passed R2 and failed to load; as any failed R2 and loaded). Type escapes and imports never reach LoadWorld: it reads values, not types.",
      rejected: [
        {
          option: "R2 judges calls too, beside LoadWorld",
          why: "Two definitions of one rule drift apart.",
        },
      ],
    },
  ],
}).edges({ uses: () => [Path.nameInWorld, Failure.format, Tsgo.check, FileSystem.read] });
