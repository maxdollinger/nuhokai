import { inherited, node } from "../src/index.ts";
import { AuditLog } from "./audit-log.ts";
import { Orders } from "./orders.ts";
import { Stock } from "./stock.ts";

/**
 * A dome: it has no behavior of its own, just two children and the ports they
 * expose. The child names in `children` are what `ports` references.
 */
export const Shop = node({
  id: "01a16dd2-bc14-752c-b0df-585621a330ab",
  purpose: "The shop backend; everything a customer interacts with lives inside it.",
  status: "planned",
  source: [],
  children: { orders: Orders, stock: Stock },
  ports: (c) => ({
    placeOrder: c.orders.ports.place,
    orderHistory: inherited(c.orders, AuditLog.history),
  }),
}).edges({});
