import { node } from "@nuhokai/world";

/** The runtime nuhokai runs on and ships inside its binary. */
export const BunRuntime = node({
  id: "01a19d0d-f3bd-74c2-a751-9c25b12d4fbe",
  external: true,
  externalType: "api",
  purpose:
    "Bun, the runtime the CLI runs on and embeds in each release binary (pinned by the repo's packageManager): " +
    "evaluates world files, matches globs, makes ids, bundles and compiles. Not built by us; users never install it.",
  status: "built",
  source: [],
  ports: {
    evaluate: {
      kind: "call",
      purpose: "Import a world file as a module, @nuhokai/world answered by a registered virtual module",
      input: "an absolute file path",
      output: "the module's exports",
      errors: ["syntax error", "the module throws", "an import resolves nowhere"],
    },
    glob: {
      kind: "call",
      purpose: "Match a /-separated relative path against a glob in Bun's syntax",
      input: "glob and path",
      output: "whether the path matches",
    },
    uuid: {
      kind: "call",
      purpose: "A fresh, time-ordered UUIDv7",
      output: "the UUID as a string",
    },
    build: {
      kind: "call",
      purpose:
        "Bundle TypeScript and JavaScript into one file, or compile a standalone per-platform binary embedding Bun",
      input: "entry points, target, format",
      output: "the bundle or binary",
      errors: ["the build failed"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Run with --no-install: an import that is not on disk is a resolve error, never a download.",
    },
    { id: "R2", text: "A module is evaluated once per path per process; a second import returns the cached one." },
    { id: "R3", text: "A virtual module registered by a plugin wins over tsconfig paths and node_modules." },
  ],
}).edges({});
