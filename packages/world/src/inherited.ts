import type { InheritedPortRef, NodeId, NodeRef, PortKind, ResolvedPortRef } from "./types.ts";

/**
 * References a port that `node` inherited from a contract it implements,
 * e.g. `inherited(Orders, AuditLog.history)`: Orders' own `history`, as
 * opposed to `AuditLog.history`, the contract's. Accepted in `uses` and in a
 * dome's `ports` like any port reference; its type keeps the implementor's id,
 * so a dome checks that it belongs to one of its direct children.
 *
 * Fails to compile unless `node` lists the port's contract in `implements`.
 */
export function inherited<K extends PortKind, Contract extends NodeId, Id extends NodeId>(
  node: NodeRef<boolean, boolean, Id, NoInfer<Contract>>,
  port: ResolvedPortRef<K, Contract>,
): InheritedPortRef<K, Id> {
  return Object.freeze({ $ref: "inherited", kind: port.kind, node, port }) as unknown as InheritedPortRef<K, Id>;
}
