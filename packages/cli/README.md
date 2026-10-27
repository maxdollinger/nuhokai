# @nuhokai/cli

Owns the toolchain around `@nuhokai/world`: it loads a repo's `nuhokai/index.ts`, runs the global rules, runs tsc and
prints one diagnostics list. A repo that uses the CLI needs no TypeScript, Bun or `node_modules` of its own.

## Layout

```
src/
  bin.ts        argv, exit codes, command dispatch
  init/         write the skeleton atomically: scaffold, publish, example world, CLI-owned files
  new/          add one node file to an existing world: the program and the file's bytes
  load/         evaluate nuhokai/ and answer the world as NodeSpecs plus its tbd placeholders
  map/          draw the loaded world into nuhokai/.generated/map.html: the program, the file, the viewer and its scene
  shared/       the world layout and its one path form, what sits at nuhokai/, and the one error type with its one-line rule
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

Planned modules, added as they are implemented:

```
src/
  rules/        global rules: duplicate ids, orphans, uses scope, names
  check/        run the embedded tsc, merge its diagnostics with the rules'
  report/       one file:line diagnostic list
  toolchain/    embedded @nuhokai/world runtime and tsc; the world types are already generated
```

## Commands

| Command  | Purpose                                                                                |
| -------- | -------------------------------------------------------------------------------------- |
| `check`  | load the world, run tsc and the global rules, exit 1 on any diagnostic _(planned)_     |
| `init`   | write the world skeleton, the CLI-owned `tsconfig.json` and the `@nuhokai/world` types |
| `map`    | draw the world into `nuhokai/.generated/map.html`, a self-contained 3D map             |
| `new`    | add one node file, `nuhokai/<node-path>.ts`, with a fresh id and `TODO:` placeholders  |
| `update` | refresh the CLI-owned `tsconfig.json` and the `@nuhokai/world` types*(planned)*        |

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
directory exits 2 and runs nothing; `nuhokai map --path packages/cli --help` prints map's help. Without a `nuhokai/`
there, `new` and `map` fail with one line. Every printed path, on stdout and in errors, is named from the current
directory, so it opens as printed: `nuhokai/.generated/map.html` without `--path`,
`packages/cli/nuhokai/.generated/map.html` with `--path packages/cli`, and a load error names
`packages/cli/nuhokai/<file>:<line>`.

`init` writes those four files and nothing else. `index.ts` carries a fresh world id, generated per run, so two
projects never share per-world state such as the map's saved layout; everything else is the same per CLI version. An
existing `nuhokai/` directory is left untouched: it prints one line and exits 0, so re-running is always safe. A file at that path is an error. The example node exists because
the format rejects an empty world, and it shows a port, a `tbd` port and a `uses` edge to copy from.

`new <node-path>` adds one node file, `nuhokai/<node-path>.ts`, merging the node path with the world's folder so a big world can
split into folders. Every segment is kebab-case; the file exports the PascalCase of the last segment, carries a fresh
uuidv7 and `TODO:` placeholders for its purpose and port shapes. It creates the parent directories it needs, never
overwrites an existing file and never edits `index.ts` or a parent: the run prints the written path and names
`index.ts` as the next step, because the author wires the node in and `check` reports it as an orphan until then.
`new` needs an existing world.

`map` loads the world as it evaluates, without running `check`, and writes `nuhokai/.generated/map.html`. The map is
one self-contained HTML file that opens offline, showing islands, domes, edges and `tbd` placeholders, each island
coloured by its status. It never opens a browser. The map remembers moved islands per browser, under the world's id
and by node id, so a regenerated map keeps them and two projects' maps never share them. World files import only `@nuhokai/world` and relative files inside `nuhokai/`; any other
import is a load error, so nothing is installed or run.

`init` (and, later, `update`) exists so an editor's built-in TypeScript can resolve `@nuhokai/world` and use the
world's strict options without the repo installing TypeScript. The CLI does not ship a language server.

## Distribution

TypeScript on Bun: `bun build src/bin.ts --target=bun` for a runnable bundle, and later `bun build --compile` for the
four targets (macOS and Linux, arm64 and x86_64). The checker (tsgo) ships as a matching per-platform sidecar; the
`@nuhokai/world` runtime and `.d.ts` are embedded.

## Development

```sh
bun run embed        # regenerate src/toolchain/world-types.gen.ts and map-assets.gen.ts
bun run build        # embed, then bundle dist/bin.js
bun run typecheck
bun test             # fails if an embedded asset is stale
```

## License

[Apache License 2.0](LICENSE).
