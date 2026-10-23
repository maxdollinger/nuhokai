# nuhokai

Stack decided in MAX-8: TypeScript end to end on Bun.

| Concern              | Choice                                                         |
| -------------------- | -------------------------------------------------------------- |
| Runtime / workspaces | Bun                                                            |
| Server               | Hono, server-authoritative                                     |
| Persistence          | `bun:sqlite`, no migrations (databases are throw-away for now) |
| Validation / schemas | TypeBox (`typebox` 1.x)                                        |
| Web                  | Vite + React, TanStack Query, SSE for live updates             |
| 3D                   | React Three Fiber + drei                                       |
| LLM                  | pi (`@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`)      |
| Lint / format / test | Biome, `bun test`                                              |

## Layout

```
apps/
  web/                  Vite + React + R3F client
  server/               Bun + Hono server
    src/graph-core/     pure graph operations (no IO)
packages/
  shared/               the only thing web and server share
    src/spec/           NodeSpec type + TypeBox schema, strict reader/writer
    src/api/            endpoint contract + SSE event types
    src/result.ts       Result type for expected errors
```

Web and server never import from each other; both depend only on `@nuhokai/shared`.
The API contract is a hand-written endpoint map (no Hono RPC, no tRPC).

## Commands

```sh
bun install
bun run dev         # server on :3000, web on :5173 (proxies /api)
bun test            # all tests
bun run typecheck   # tsc per workspace
bun run check       # biome lint + format check (bun run fix to apply)
bun run build       # production build of the web client
```

Server env: `PORT` (default 3000), `NUHOKAI_DB` (default `data/nuhokai.db`).
Web env: `NUHOKAI_SERVER` (proxy target, default `http://localhost:3000`).

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md): the source is public and free for personal and other noncommercial use.
Commercial use is not permitted without a separate license from the copyright holder.

This project is source-available, not open source. Contributions (pull requests) are not accepted at this time.
