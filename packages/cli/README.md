# @nuhokai/cli

Owns the toolchain around `@nuhokai/world`: it loads a repo's `nuhokai/index.ts`, runs the global rules, runs tsc and
prints one diagnostics list. A repo that uses the CLI needs no TypeScript, Bun or `node_modules` of its own.

## Layout

```
src/
  bin.ts        argv, exit codes, command dispatch
  index.ts      public exports for tests and embedding
test/           CLI tests and, later, fixture worlds
nuhokai/        this package described as a node in its own format
```

Planned modules, added as they are implemented:

```
src/
  load/         locate and evaluate nuhokai/index.ts; collect exported nodes
  rules/        global rules: duplicate ids, orphans, uses scope, names
  check/        run the embedded tsc, merge its diagnostics with the rules'
  report/       one file:line diagnostic list
  toolchain/    embedded @nuhokai/world runtime, .d.ts and tsc
```

## Commands

| Command | Purpose                                                                                |
| ------- | -------------------------------------------------------------------------------------- |
| `check` | load the world, run tsc and the global rules, exit 1 on any diagnostic                 |
| `init`  | write the world skeleton, the CLI-owned `tsconfig.json` and the `@nuhokai/world` types |
| `sync`  | refresh the CLI-owned `tsconfig.json` and the `@nuhokai/world` types                   |

`init` writes one folder, with everything the tool needs inside it:

```text
nuhokai/
  index.ts                  the world entry point
  <nodes>.ts                node files
  tsconfig.json             CLI-owned, committed
  .generated/world/         embedded @nuhokai/world .d.ts, committed and refreshed by sync
```

`init` and `sync` exist so an editor's built-in TypeScript can resolve `@nuhokai/world` and use the world's strict
options without the repo installing TypeScript. The CLI does not ship a language server.

## Distribution

TypeScript on Bun: `bun build src/bin.ts --target=bun` for a runnable bundle, and later `bun build --compile` for the
four targets (macOS and Linux, arm64 and x86_64). The checker (tsgo) ships as a matching per-platform sidecar; the
`@nuhokai/world` runtime and `.d.ts` are embedded.

## Development

```sh
bun run typecheck
bun test
```
