# @nuhokai/cli

Owns the toolchain around `@nuhokai/world`: it loads a repo's `nuhokai/index.ts`, runs the global rules, runs tsc and
prints one diagnostics list. A repo that uses the CLI needs no TypeScript, Bun or `node_modules` of its own.

## Layout

```
src/
  bin.ts        argv, exit codes, command dispatch to cli/commands, listed at the top of main
  cli/          Cmd: each command's help text, argument parser and deferred call into its node, one file per command
  init/         write the skeleton atomically: scaffold, publish, example world, CLI-owned files
  load/         read nuhokai/ without running it (the reader) and answer the world: each node with its NodeSpec, place, path and file, plus tbd placeholders, listings and orphans
  map/          draw the loaded world into nuhokai/.generated/map.html: the program, the file, the viewer and its scene
  check/        check the world: tsc and the declarative rule, the spec rules on the loaded world, one diagnostics list
  tree/         print the node hierarchy, one line per node: the program and the lines
  shared/       the names the CLI prints (a file's path, a node's hierarchy path, a suggested command), what sits at nuhokai/,
                the error types and plain text, and the one client of the pinned type checker
  toolchain/    generated assets: @nuhokai/world declarations, three.js and the map's viewer
scripts/        build-time embedding of those assets
nuhokai/        this package described as nodes in its own format
```

Unit tests sit next to what they test (`*.test.ts`); there is no `test/` directory and no export exists solely for a
test. `src/toolchain/world-types.gen.ts` is generated from `packages/world` and `src/toolchain/map-assets.gen.ts` from
the exactly pinned `three` dev dependency plus `src/map/viewer.html` and `src/map/scene.js`; both are checked in.
`bun run embed` regenerates them, `bun run build` embeds before bundling, and `bun test` fails if a committed asset is
stale. A test also type-checks a consumer world against the bundled declarations, so the `.d.ts` cannot drift from
`@nuhokai/world`.

## Commands

| Command  | Purpose                                                                                |
| -------- | -------------------------------------------------------------------------------------- |
| `check`  | load the world, run tsc and the global rules, exit 1 on any error (warnings pass)      |
| `init`   | write the world skeleton, the CLI-owned `tsconfig.json` and the `@nuhokai/world` types |
| `map`    | draw the world into `nuhokai/.generated/map.html`, a self-contained 3D map             |
| `tree`   | print the node hierarchy, one line per node: `path \| source \| purpose`               |
| `update` | refresh the CLI-owned `tsconfig.json` and the `@nuhokai/world` types (planned)         |

`init` writes one folder, with everything the tool needs inside it:

```text
nuhokai/
  index.ts                  the world entry point, under the world's own id
  example.ts                one example node, to replace with the first real node
  <nodes>.ts                node files
  tsconfig.json             CLI-owned, committed
  .generated/world/         embedded @nuhokai/world .d.ts, committed and refreshed by `update`
  .generated/map.html       the map, written by `map`
```

Every command works in one project directory: the current directory, or the one given with `--path <dir>` (or
`--path=<dir>`, as in `nuhokai map --path packages/cli`). A `--path` without a value, given twice or naming no
directory exits 2 and runs nothing; `nuhokai map --path packages/cli --help` prints map's help. Before a command,
`help`, `--help` and `-h` print the usage; after one only `--help` and `-h` are help, so `nuhokai tree help`
starts from a node named `help`. Any other argument starting with `-` is an unknown option and an extra argument is named; both
exit 2 and run nothing. Without a `nuhokai/`
there, `check`, `map` and `tree` fail with one line. Every printed path, on stdout and in errors, is named from the current
directory, so it opens as printed: `nuhokai/.generated/map.html` without `--path`,
`packages/cli/nuhokai/.generated/map.html` with `--path packages/cli`, and a load error names
`packages/cli/nuhokai/<file>:<line>`.

`init` writes those four files and nothing else. `index.ts` carries a fresh world id, generated per run, so two
projects never share per-world state such as the map's saved layout; everything else is the same per CLI version. An
existing `nuhokai/` directory is left untouched: it prints one line and exits 0, so re-running is always safe. A file at that path is an error. The example node exists because
the format rejects an empty world, and it shows a port, a `tbd` port and a `uses` edge to copy from.

`check` loads the world once, then type-checks it with the CLI's pinned checker and `nuhokai/tsconfig.json` beside
the spec rules on the loaded world (unique ids, orphans, `uses` scope, sibling names, the rules tsc leaves to `check`, and every
`source` entry against the project's files); the code check runs only when neither found an error, and finds nothing
yet. Every finding is one stdout line, `<severity>: <file>:<line>: <node>: <rule>; <fix>`, naming a node by its path
from the world. World files must stay declarative: the loader rejects anything that is not data (calls other than the
format's functions among it), and the type check allows imports only from `@nuhokai/world` and other world files and
no cast but `as const`, no non-null assertion, `any` or `@ts-` directive, so nothing bypasses tsc's rules. It
exits 1 on any error and 0 otherwise; orphans are warnings. A missing world is one stderr line; a world that fails to
load still gets every tsc finding, then one stderr line for the load failure.

`map` loads the world as it reads, without running `check`, and writes `nuhokai/.generated/map.html`. The map is
one self-contained HTML file that opens offline, showing islands, domes, edges and `tbd` placeholders, each island
coloured by its status. A search box (`/` or Ctrl/⌘K) finds nodes and ports by name (`stock reserve` names a port
with its node) and `tbd` placeholders by export name or description in every scope, lights them in the open scope and jumps to one
with Enter or a click. It never opens a browser. The map remembers moved islands per browser, under the world's id
and by node id, so a regenerated map keeps them and two projects' maps never share them.

Loading never runs a world file. The CLI's pinned checker parses `nuhokai/` and resolves every name to its
declaration, through imports, re-exports and aliases, and the format's calls are read as data, so import cycles never
matter and nothing is installed or executed. The loader is the one judge of whether a world file is data: every
statement and value in it, used or not, must be readable, and anything else (a call to another function, a value
imported from a package, a statement block in `uses`, a top-level statement) is one load error at its file and line. It needs no `nuhokai/tsconfig.json`: it opens a project of its own with exactly the world files.

`tree` prints the node hierarchy, one line per node: `path | source | purpose`, e.g.
`Check/ (5) | src/check/** | Ensure the specs follow the rules.` Every line carries the node's full hierarchy path
(names joined by `/`, as `check` names nodes), so it still makes sense after `grep` and can be passed back as is:
`nuhokai tree Check -L 2` starts from Check and prints two levels below it. `-L`/`--level` defaults to 1, and `0` prints
everything; a dome cut off by the level shows `/ (<n>)` and its child count. Sources print from the current directory,
like every other path, and the whole purpose stays on the line. Like `map`, `tree` does not run `check`. A path that
names no node exits 2 with the closest match (`did you mean 'Check/SpecCheck'?`) or the `tree` command listing where it
went wrong.

`init` (and, later, `update`) exists so an editor's built-in TypeScript can resolve `@nuhokai/world` and use the
world's strict options without the repo installing TypeScript. The CLI does not ship a language server.

## Distribution

TypeScript on Bun: `bun build src/bin.ts --target=bun` for a runnable bundle, and `bun build --compile` for the
release binaries, built natively for three targets: macOS arm64, Linux x86_64 and Linux arm64 (macOS x86_64 can join
the matrix later). The checker (tsgo) ships as a matching per-platform sidecar from the repo's pinned TypeScript; it
reads worlds for every command and type-checks them for `check`. The `@nuhokai/world` `.d.ts` is embedded. Users need
no Node, Bun or TypeScript.

Each release archive, `nuhokai-v<version>-<target>.tar.gz`, holds:

```text
nuhokai-v<version>-<target>/
  nuhokai           the compiled CLI
  tsgo/             tsgo, its lib.*.d.ts and Microsoft's detached signature, LICENSE and NOTICE
  LICENSE
```

Only this package is versioned. To release, set `version` in `package.json`, merge, then push the matching tag (`git tag
v0.1.0 && git push origin v0.1.0`). `.github/workflows/release.yml` runs CI, fails if the tagged commit is not on `main`
or the tag is not `v<version>`, builds and smoke-tests each target on its own runner (`init`, `map` and a dangling ref
reported by the bundled tsgo, in an empty directory with no Node on the PATH), then attests their build provenance and
publishes a GitHub Release with the archives, `SHA256SUMS` and generated notes. Verify a download with `gh attestation
verify <archive> -R maxdollinger/nuhokai`. A tag with a `-` (`v0.2.0-rc.1`) publishes a pre-release.

## Development

```sh
bun run embed        # regenerate src/toolchain/world-types.gen.ts and map-assets.gen.ts
bun run build        # embed, then bundle dist/bin.js
bun run typecheck
bun test             # fails if an embedded asset is stale
bun scripts/package-release.ts                  # compile this machine's target into dist/release/
scripts/smoke-release.sh dist/release/<archive>   # the release's smoke test against that archive
```

## License

[Apache License 2.0](LICENSE).
