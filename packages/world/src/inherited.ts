import type { InheritedPortRef, NodeRef, NodeUuid, PortKind, ResolvedPortRef } from "./types.ts";

/**
 * References a port that `node` inherited from a contract it implements,
 * e.g. `inherited(Orders, AuditLog.history)`: Orders' own `history`, as
 * opposed to `AuditLog.history`, the contract's. Accepted in `uses` and
 * `delegate` like any port reference; its type keeps the implementor's id, so
 * `relation` can check a delegate target.
 *
 * Fails to compile unless `node` lists the port's contract in `implements`.
 */
export function inherited<K extends PortKind, Contract extends NodeUuid, Id extends NodeUuid>(
  node: NodeRef<boolean, boolean, Id, NoInfer<Contract>>,
  port: ResolvedPortRef<K, Contract>,
): InheritedPortRef<K, Id> {
  return Object.freeze({ $ref: "inherited", kind: port.kind, node, port }) as unknown as InheritedPortRef<K, Id>;
}
