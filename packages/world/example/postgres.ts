import { node } from "../src/index.ts";

export const Postgres = node({
  id: "01a16dd2-bc36-723e-8ba3-48099f422a52",
  external: true,
  externalType: "db",
  purpose: "The shared database: stores and queries the shop's data over SQL. Run by ops, not built by us.",
  source: [],
  ports: { query: { kind: "call", purpose: "Run SQL", transport: "postgres" } },
}).edges({});
