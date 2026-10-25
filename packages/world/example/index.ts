import { defineWorld, relation } from "../src/index.ts";
import { AuditLog } from "./audit-log.ts";
import { Orders } from "./orders.ts";
import { Postgres } from "./postgres.ts";
import { Shop } from "./shop.ts";
import { Stock } from "./stock.ts";

/**
 * The example world: the hierarchy in one place, and the loader's only entry
 * point. Node files never import it. Externals are top level only.
 * The file is also the folder's barrel (see the re-exports below), so it is
 * the one file that is not a node file.
 */
export default defineWorld({
  children: [
    Postgres,
    AuditLog,
    relation({
      parent: Shop,
      children: [Orders, Stock],
    }),
  ],
});

// The barrel: one export per node, plus the shared placeholder.
export { AuditLog } from "./audit-log.ts";
export { notifyCustomer } from "./holes.ts";
export { Orders } from "./orders.ts";
export { Postgres } from "./postgres.ts";
export { Shop } from "./shop.ts";
export { Stock } from "./stock.ts";
