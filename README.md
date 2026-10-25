# nuhokai

TypeScript on Bun.

| Concern              | Choice            |
| -------------------- | ----------------- |
| Runtime / workspaces | Bun               |
| Lint / format / test | Biome, `bun test` |

## Layout

```
packages/
  world/                world format: MAX-5 node types, defineNode, typed refs, tbd placeholders (MAX-10), defineWorld/relation (MAX-12)
  cli/                  @nuhokai/cli: loads a world, owns the toolchain (tsc, embedded world types), prints diagnostics
```

## Commands

```sh
bun install
bun test            # all tests
bun run typecheck   # tsc per workspace
bun run check       # biome lint + format check (bun run fix to apply)
```
