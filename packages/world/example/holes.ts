import { tbd } from "../src/index.ts";

/** Used by both Orders and Stock: find-references on it lists every dependent. */
export const notifyCustomer = tbd.call({
  description: "Tell a customer that their order changed; channel (mail, push) not decided yet.",
});
