import { node } from "@nuhokai/world";
import { Cli } from "./cli.ts";

// Everything the CLI relies on but does not build: top-level external nodes, in the world's listing order.

/** Whoever runs nuhokai: a person at a shell, a script or a CI step. */
export const Terminal = node({
  id: "01a19d0d-f3b2-75ea-839d-c2a3a079b878",
  external: true,
  externalType: "caller",
  purpose:
    "Whoever runs nuhokai: a person at a shell (a tty), a script or a CI step. Starts the process with argv in a " +
    "working directory, reads its stdout and stderr lines and branches on the exit code. Never asked anything.",
  status: "built",
  source: [],
  ports: {
    print: {
      kind: "call",
      purpose: "Take one line of a command's result: a written path, a diagnostic, a tree line, the usage",
      input: "one line of text",
    },
    printError: {
      kind: "call",
      purpose: "Take one line about a failure or a wrong invocation, prefixed 'nuhokai <command>: '",
      input: "one line of text, or the usage after a usage error",
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Plain lines only: no colour, cursor control or progress, no control or bidirectional format character from what is printed; output is the same on a tty and through a pipe, so grep and scripts read it as printed.",
    },
    {
      id: "R2",
      text: "Never prompted: nothing reads stdin, so every command runs unattended (Cli: project directory = the cwd or --path).",
    },
    { id: "R3", text: "Paths it reads are named from its working directory, so they open as printed." },
  ],
}).edges({ uses: () => [Cli.dispatch] });

/** The disk under the project directory: where the world is read from and everything nuhokai writes goes. */
export const FileSystem = node({
  id: "01a19d0d-f3b7-7156-a269-7921e6c90b99",
  external: true,
  externalType: "db",
  purpose:
    "The operating system's filesystem: the project directory's files, the world in nuhokai/ and everything the " +
    "CLI writes. The only state nuhokai keeps; no database, cache or config elsewhere.",
  status: "built",
  source: [],
  ports: {
    read: {
      kind: "call",
      purpose: "Observe what is at a path: stat or lstat it, list a directory, resolve a symlink, read a file",
      input: "a path, cwd-relative",
      output: "the entry's kind, a directory's entries, the real path or a file's text",
      errors: ["errno failure: missing entry, permission, a symlink that cannot be resolved"],
    },
    write: {
      kind: "call",
      purpose:
        "Change what is at a path: create directories (also a fresh temporary one), write a file, rename, remove a tree",
      input: "a path, cwd-relative, and the content",
      output: "nothing",
      errors: ["errno failure: permission, disk full, a path in the way"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Every failure is a thrown Error with a numeric errno, which Failure.isExpected counts as expected.",
    },
    { id: "R2", text: "A rename within one filesystem is atomic: Publish's commit." },
    { id: "R3", text: "stat and realpath follow symlinks, lstat does not: Inspect tells a linked world apart." },
  ],
}).edges({});

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

/** Where the map is looked at; nuhokai never opens it. */
export const Browser = node({
  id: "01a19d0d-f3c8-74cc-b38d-ebccaea7dbe5",
  external: true,
  externalType: "api",
  purpose:
    "Whichever web browser the user opens nuhokai/.generated/map.html in, offline from a file URL. Runs the Viewer " +
    "and keeps its saved layout. nuhokai never starts it.",
  status: "built",
  source: [],
  ports: {
    runPage: {
      kind: "call",
      purpose:
        "Run a local HTML page: inline scripts, a WebGL canvas, pointer, wheel and keyboard input, media queries, a live region for screen readers",
      input: "one self-contained HTML file",
      output: "the rendered, interactive page",
      errors: ["no WebGL"],
    },
    store: {
      kind: "call",
      purpose: "localStorage: string values by key, per browser and origin, kept across page loads",
      input: "key, and the value to set",
      output: "the stored value, or none",
      errors: ["storage unavailable, blocked or full"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Storage can be missing, blocked or full: the page then forgets moved islands and still works.",
    },
    { id: "R2", text: "Nothing is fetched: the page and its scripts are one file." },
  ],
}).edges({});

/** The 3D library the map draws with, inlined into every map. */
export const ThreeJs = node({
  id: "01a19d0d-f3ce-7579-af2c-a929efcd4856",
  external: true,
  externalType: "api",
  purpose:
    "three.js with OrbitControls, at the exactly pinned dev-dependency version: scene graph, WebGL renderer and " +
    "camera controls the Viewer draws with. Inlined into every map at build time; not built by us.",
  status: "built",
  source: [],
  ports: {
    render: {
      kind: "call",
      purpose: "Build a 3D scene, render it to a WebGL canvas and orbit, pan and zoom its camera",
      input: "meshes, materials, lights, camera; pointer input for the controls",
      output: "the drawn frame",
    },
  },
  requirements: [
    { id: "R1", text: "One classic script setting THREE, so the map inlines it and loads nothing." },
    { id: "R2", text: "Its license header stays in every map." },
  ],
}).edges({});
