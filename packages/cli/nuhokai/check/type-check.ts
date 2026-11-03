import { node } from "@nuhokai/world";
import { CheckerClient } from "../checker-client.ts";
import { FileSystem } from "../external.ts";
import { Failure } from "../failure.ts";
import { Path } from "../path/path.ts";
import { Diagnostics } from "./diagnostics.ts";

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
      output: "findings as Diagnostics.format takes them: one error per tsc error, at its file:line:column",
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
    {
      id: "R4",
      text: 'A finding says what to change in the world, not how tsc typed it: an error about a Forbidden<"…"> of the format (also a readonly Forbidden<"…">[]) is that message alone; any other keeps tsc\'s words with each type cut to its names (NodeShape, not its arguments and constraints) and the type of a value the reader wrote (Argument of type, missing in type) as { … } when tsc spells out a long object literal, while the type it should match stays; a quote inside a string literal type or an apostrophe in the prose of tsc ending no type, and a type tsc cut off mid-literal keeping its names (NodeHandle<…>); tsc\'s advice to change the library or install types is replaced by the world\'s fix, since the tsconfig is CLI-owned.',
    },
    {
      id: "R5",
      text: "One break, one finding: a file that does not parse is its first syntax error alone (the parser's guesses after it are noise), and tsc's 'cannot find module' at the specifier of an import R2 refuses is left out, R2's finding saying what to do, the import on one line or several.",
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
    {
      text: "children: [Draft] (no .edges) → 'a draft is not a node: call .edges(), also with {}'; purpos: 'x' → \"… does not exist in type 'NodeShape'. Did you mean to write 'purpose'?\"; typeof console → \"Cannot find name 'console'; remove the code that uses it: world files hold data only (…)\".",
      demonstrates: ["R4"],
    },
    {
      text: 'An unterminated string in a.ts → only "\',\' expected." at its line; import { pad } from "left-pad" → R2\'s finding alone.',
      demonstrates: ["R5"],
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
}).edges({ uses: () => [Path.nameInWorld, Failure.format, CheckerClient.session, Diagnostics.order, FileSystem.read] });
