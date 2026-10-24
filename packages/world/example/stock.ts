import { defineNode } from "../src/index.ts";
import { notifyCustomer } from "./holes.ts";
import { Orders } from "./orders.ts";
import { Postgres } from "./postgres.ts";

export const Stock = defineNode({
  id: "01a16dd2-bc2d-708e-89cb-3a9da2e0550d",
  purpose: "Counts what is on the shelf and holds reservations.",
  status: "planned",
  source: [],
  ports: {
    reserve: { kind: "call", purpose: "Reserve items for an order", input: "order id and lines", errors: ["short"] },
  },
}).edges({
  // Orders and Stock use each other (A <-> B cycle); no annotation needed.
  uses: () => [Orders.cancelled, Postgres.query, notifyCustomer],
});
