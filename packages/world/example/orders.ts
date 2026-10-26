import { node } from "../src/index.ts";
import { AuditLog } from "./audit-log.ts";
import { notifyCustomer } from "./holes.ts";
import { Stock } from "./stock.ts";

export const Orders = node({
  id: "01a16dd2-bc20-732c-ae7b-02362b8baff1",
  purpose: "Owns orders from checkout to delivery; does not know how stock is counted.",
  status: "planned",
  source: [],
  ports: {
    place: {
      kind: "call",
      purpose: "Place an order",
      input: "cart lines",
      output: "order id",
      errors: ["out of stock"],
    },
    cancelled: { kind: "event", purpose: "An order was cancelled", payload: "order id and its lines" },
  },
  implements: () => [AuditLog],
}).edges({
  uses: () => [Stock.reserve, notifyCustomer],
});
