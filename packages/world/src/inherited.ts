import type { InheritedPortRef, NodeRef, NodeUuid, PortKind, ResolvedPortRef } from "./types.ts";

/**
 * References a port that `node` inherited from a contract it implements,
 * e.g. `inherited(Orders, AuditLog.history)`: Orders' own `history`, as
 * opposed to `AuditLog.history`, the contract's. Accepted in `uses` and
 * `delegate` like any port reference.
 *
 * Fails to compile unless `node` lists the port's contract in `implements`.
 */
export function inherited<K extends PortKind, Contract extends NodeUuid>(
  node: NodeRef<boolean, boolean, NodeUuid, NoInfer<Contract>>,
  port: ResolvedPortRef<K, Contract>,
): InheritedPortRef<K> {
  return Object.freeze({ $ref: "inherited", kind: port.kind, node, port }) as unknown as InheritedPortRef<K>;
}
