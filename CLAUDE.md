# Working in nuhokai

See README.md for the stack and layout. Rules:
- `apps/web` and `apps/server` never import from each other. Shared code goes in `packages/shared`.
- New endpoints: add them to `endpoints` in `packages/shared/src/api`, with a TypeBox response schema.
- Keep plain TS types and TypeBox schemas in sync with the `Equals` compile-time check (see `spec/node-spec.ts`).
- Schemas for stored or transmitted data are strict (`additionalProperties: false`).
- `apps/server/src/graph-core` is pure: no IO. Return `Result` for expected errors.
- State lives on the server; the client is a TanStack Query cache fed by requests and SSE. No client state library.
- No Effect, no Zod, no Hono RPC.
- Before committing: `bun test && bun run typecheck && bun run check`.
