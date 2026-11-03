import { node } from "@nuhokai/world";

/** The runtime nuhokai runs on and ships inside its binary. */
export const BunRuntime = node({
  id: "01a19d0d-f3bd-74c2-a751-9c25b12d4fbe",
  external: true,
  externalType: "api",
  purpose:
    "Bun, the runtime the CLI runs on and embeds in each release binary (pinned by the repo's packageManager): " +
    "matches globs, makes ids, bundles and compiles. Never runs a world file. Not built by us; users never install it.",
  status: "built",
  source: [],
  ports: {
    matchGlob: {
      kind: "call",
      purpose: "Match a /-separated relative path against a glob in Bun's syntax",
      input: "glob and path",
      output: "whether the path matches",
    },
    makeUuid: {
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
}).edges({});
