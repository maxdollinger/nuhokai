import { node } from "../src/index.ts";

/** Contract: implemented by every node that keeps an audit trail. */
export const AuditLog = node({
  id: "01a16dd2-bc3e-72ea-95ef-5c4ccd593be9",
  abstract: true,
  purpose: "Lets compliance read who changed what, independent of the owning node.",
  status: "planned",
  source: [],
  ports: { history: { kind: "call", purpose: "Changes to an entity", input: "entity id", output: "change list" } },
  requirements: [{ id: "R1", text: "Every change is listed with author and time." }],
}).edges({});
