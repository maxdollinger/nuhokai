import { defineWorld } from "../src/index.ts";
import { AuditLog } from "./audit-log.ts";
import { Postgres } from "./postgres.ts";
import { Shop } from "./shop.ts";

/**
 * The example world: the top-level nodes, and the loader's only entry point.
 * A node lists its own children; node files never import this file. Externals
 * are top level only. The file is also the folder's barrel (see the
 * re-exports below), so it is the one file that is not a node file.
 */
export default defineWorld({
  id: "01a17bb6-ad4d-7298-8492-a53237d45f80",
  children: [Postgres, AuditLog, Shop],
});

export { notifyCustomer } from "./holes.ts";
export { Orders } from "./orders.ts";
export { Stock } from "./stock.ts";
// The barrel: one export per node, plus the shared placeholder.
export { AuditLog, Postgres, Shop };
