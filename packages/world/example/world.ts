import { defineWorld, relation } from "../src/index.ts";
import { AuditLog } from "./audit-log.ts";
import { Orders } from "./orders.ts";
import { Postgres } from "./postgres.ts";
import { Shop } from "./shop.ts";
import { Stock } from "./stock.ts";

/**
 * The example world: the hierarchy in one place, and the loader's only entry
 * point. Node files never import it. Externals are top level only.
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
