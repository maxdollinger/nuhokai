import { defineNode } from "../src/index.ts";

export const Postgres = defineNode({
  id: "01a16dd2-bc36-723e-8ba3-48099f422a52",
  external: true,
  externalType: "db",
  purpose: "The shared database; run by ops, not built by us.",
  status: "built",
  source: [],
  ports: { query: { kind: "call", purpose: "Run SQL", transport: "postgres" } },
}).edges({});
