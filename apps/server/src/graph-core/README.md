# graph-core

Pure graph operations on the world (node specs from `@nuhokai/shared/spec`).

Rules:
- No IO: no `bun:sqlite`, no Hono, no network, no filesystem, no LLM calls.
- Expected errors are returned as `Result` from `@nuhokai/shared/result`; only bugs throw.
- Operation _types/schemas_ that cross the wire or get stored belong in
  `@nuhokai/shared/spec`; the logic that applies them lives here.

This folder is the target of the "coding agent implements graph-core from specs"
spike, so it should stay understandable and testable on its own.
