import { node } from "@nuhokai/world";
import { BunRuntime } from "../external.ts";

/** A source entry as a pattern over paths. Pure. */
export const SourcePath = node({
  id: "01a1a638-3113-740f-8428-99892b48b1e7",
  purpose:
    "Own what a source entry means as a pattern: whether it is a glob, where its files can lie, and which paths it " +
    "matches. Pure: compares paths, never looks at the files behind them.",
  status: "building",
  source: ["src/shared/source-path.ts", "src/shared/source-path.test.ts"],
  ports: {
    isGlob: {
      kind: "call",
      purpose: "Tell a glob from a plain path",
      input: "a source entry",
      output: "whether it holds a glob character",
      errors: [],
    },
    staticPrefix: {
      kind: "call",
      purpose: "The directory every file an entry matches lies below",
      input: "a source entry",
      output: "its segments before the first one holding a glob character, /-joined; '' for the project directory",
      errors: [],
    },
    matches: {
      kind: "call",
      purpose: "Whether an entry matches a path",
      input: "a source entry, a /-separated path relative to the project directory",
      output: "whether it matches",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "One matcher for every entry: Bun's glob syntax on /-separated paths relative to the project directory. A plain path matches only itself.",
    },
    {
      id: "R2",
      text: "Glob characters: * ? [ ] { } ! \\. An entry without any is a plain path, its static prefix its directory.",
    },
    { id: "C1", kind: "constraint", text: "No filesystem access, load or printing." },
  ],
  testCases: [
    {
      text: "src/map/** → glob, prefix src/map, matches src/map/a.ts and src/map/b/c.ts, not src/mapper.ts; src/*.ts → prefix src; **/x.ts → prefix ''.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "src/bin.ts → no glob, prefix src, matches only src/bin.ts; no call reads the disk.",
      demonstrates: ["R1", "R2", "C1"],
    },
  ],
}).edges({ uses: () => [BunRuntime.matchGlob] });
