# Working in nuhokai

See README.md for the layout and packages/world/README.md for the world format. Rules:
- `@nuhokai/world` has zero runtime dependencies and no side effects; its runtime code imports nothing.
- Node fields come from the types in `packages/world/src/node-spec.ts`; never redeclare them.
- Commits follow Conventional Commits (`feat(world): …`, `fix(world): …`).
- Before committing: `bun test && bun run typecheck && bun run check`.
- CI runs the same checks plus `bun run build` and the linux-x64 release package and smoke test on every PR and push to `main`. PR titles must be Conventional Commits (scope `world` or `cli`, optional); squash merging uses the title as the commit message.
- Pushing a `v*` tag matching `packages/cli/package.json`'s version releases the CLI binaries (`release.yml`).
- Specs for the cli package are under `packages/cli/nuhokai`
