# nuhokai

TypeScript on Bun.

| Concern              | Choice            |
| -------------------- | ----------------- |
| Runtime / workspaces | Bun               |
| Lint / format / test | Biome, `bun test` |

## Layout

```
packages/
  world/                world format: node types, node()/defineWorld, leaves and domes, typed refs, tbd
  cli/                  @nuhokai/cli: the toolchain around the world format (`init` and `new` today; `map`, `check`, `update` planned)
```

## Commands

```sh
bun install
bun test            # all tests
bun run typecheck   # tsc per workspace
bun run check       # biome lint + format check (bun run fix to apply)
```
