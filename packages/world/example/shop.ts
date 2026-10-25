import { defineNode, inherited } from "../src/index.ts";
import { AuditLog } from "./audit-log.ts";
import { Orders } from "./orders.ts";

/** Exposes ordering to the outside by delegating to its child Orders (see index.ts). */
export const Shop = defineNode({
  id: "01a16dd2-bc14-752c-b0df-585621a330ab",
  purpose: "The shop backend; everything a customer interacts with lives inside it.",
  status: "planned",
  source: [],
  ports: {
    placeOrder: { kind: "call", purpose: "Place an order from checkout", transport: "http" },
    orderHistory: { kind: "call", purpose: "Audit trail of an order, for compliance", transport: "http" },
  },
  // In step one: the handle's type records the targets, so relation() checks they are Shop's children.
  delegate: {
    placeOrder: () => Orders.place,
    orderHistory: () => inherited(Orders, AuditLog.history),
  },
}).edges({});
