# Working in nuhokai

See README.md for the layout and packages/world/README.md for the world format. Rules:
- `@nuhokai/world` has zero runtime dependencies and no side effects; its runtime code imports nothing.
- Node fields come from the types in `packages/world/src/node-spec.ts`; never redeclare them.
- Commits follow Conventional Commits (`feat(world): …`, `fix(world): …`).
- Before committing: `bun test && bun run typecheck && bun run check`.
- Specs for the cli package are under `packages/cli/nuhokai`
