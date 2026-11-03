import { node } from "@nuhokai/world";

/** The pinned TypeScript checker, never the repo's own. */
export const Tsgo = node({
  id: "01a19d0d-f3c2-73b5-ac60-59684513a214",
  external: true,
  externalType: "api",
  purpose:
    "TypeScript's native checker (tsgo) at the version the CLI pins: type-checks world files, and parses them for the " +
    "declarative rule and for the loader, which reads worlds without running them. Ships next to the release binary as a sidecar; from source, the platform build of the pinned " +
    "typescript package. Not built by us.",
  status: "built",
  source: [],
  ports: {
    check: {
      kind: "call",
      purpose: "Type-check a project and hand back its parsed files, over the typescript API to a spawned tsgo",
      input: "a tsconfig.json path",
      output: "diagnostics with file, position and message chain; each file's syntax tree",
      errors: ["no checker at the expected path", "the checker process failed"],
    },
    read: {
      kind: "call",
      purpose: "Parse files and resolve names to their declarations, over the typescript API to a spawned tsgo",
      input: "a tsconfig.json listing the files",
      output: "each file's syntax tree; a name's symbol, its alias target and declaration; a module's exports",
      errors: ["no checker at the expected path", "the checker process failed"],
    },
    emit: {
      kind: "call",
      purpose: "Emit declaration files for a project; Build only, through the repo's own install of the same version",
      input: "a tsconfig.json with declaration output",
      output: ".d.ts files in the outDir",
      errors: ["type errors (nothing emitted)"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "One version for every user: the release ships its tsgo, lib.*.d.ts, signature and license beside the binary.",
    },
    { id: "R2", text: "Reads the files itself; nuhokai hands it only the tsconfig." },
  ],
}).edges({});
