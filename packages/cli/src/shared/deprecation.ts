/** Which deprecation a node, or a use of its ports, is under: the one answer check and review give. Pure. */
import type { NodeSpec, Port } from "@nuhokai/world/node-spec";
import type { LoadedNode, LoadedWorld } from "../load/load-world.ts";

/** A deprecation: the note, and the node that carries it. */
export interface Deprecation {
  /** The note, trimmed: why, and what to use instead. */
  readonly note: string;
  /** The node carrying it. */
  readonly by: LoadedNode;
}

/** A deprecation a use of a node meets, with the ports used there that lead to it. */
export interface UseDeprecation extends Deprecation {
  readonly ports: readonly string[];
}

/**
 * The deprecation `node` is under (R1): its own note, else that of the nearest dome around it; undefined when neither
 * it nor a dome around it has one. A note that is not a string, or blank, says nothing.
 */
export function deprecationOf(world: LoadedWorld, node: LoadedNode): Deprecation | undefined {
  for (let at: LoadedNode | undefined = node; at; at = at.parent === null ? undefined : world.nodes[at.parent]) {
    const note: unknown = at.spec.deprecated;
    if (typeof note === "string" && note.trim() !== "") return { note: note.trim(), by: at };
  }
  return undefined;
}

/**
 * The nodes a port of `node` leads through (R2): the node, then down a dome port's delegate to the child that handles
 * it, or to the contract an inherited port comes from, until a node declares the port itself. A port it neither
 * declares nor inherits ends at the node; a delegate cycle in an unchecked world ends where it repeats.
 */
function portPath(world: LoadedWorld, node: LoadedNode, port: string): LoadedNode[] {
  const path: LoadedNode[] = [];
  let at: LoadedNode | undefined = node;
  let name = port;
  while (at && !path.includes(at)) {
    path.push(at);
    const declares = (spec: NodeSpec) => (Array.isArray(spec.ports) ? spec.ports : []).find((p) => p?.name === name);
    const own: Port | undefined = declares(at.spec);
    if (own?.delegate) {
      const { to, port: handled } = own.delegate;
      at = at.children.map((child) => world.nodes[child]).find((child) => child?.spec.id === to);
      name = handled;
    } else if (own) {
      at = undefined;
    } else {
      at = at.contracts
        .map((contract) => (contract === null ? undefined : world.nodes[contract]))
        .find((contract) => contract && declares(contract.spec));
    }
  }
  return path;
}

/**
 * The deprecations a use of `ports` of `target` meets (R2): per port, the first deprecation along the nodes it leads
 * through, so a dome port delegating to a deprecated child, or an inherited port of a deprecated contract, meets that
 * node's. One entry per node carrying a note, with the ports leading to it, in the ports' order.
 */
export function deprecationsOfUse(world: LoadedWorld, target: LoadedNode, ports: readonly string[]): UseDeprecation[] {
  const met = new Map<LoadedNode, UseDeprecation & { ports: string[] }>();
  for (const port of ports) {
    const deprecation = portPath(world, target, port)
      .map((node) => deprecationOf(world, node))
      .find((found) => found !== undefined);
    if (!deprecation) continue;
    const entry = met.get(deprecation.by) ?? { ...deprecation, ports: [] };
    entry.ports.push(port);
    met.set(deprecation.by, entry);
  }
  return [...met.values()];
}
