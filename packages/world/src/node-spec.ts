/**
 * Node spec, schema `nuhokai/node@1`: the plain types only.
 * The world format (`types.ts`) derives its authoring types from these, so
 * they stay the only source of truth for node fields. Type-only: nothing
 * here exists at runtime.
 */

/** Stable slug, unique within the world. Also the file name. */
export type NodeId = string;

/**
 * Prose description of data crossing a boundary, e.g.
 * "order id and requested quantity".
 * Deliberately not a type system: the implementing agent derives the
 * concrete shape, reading the callee's code where it already exists.
 */
export type Shape = string;

// ─── Ports ───────────────────────────────────────────────────────────────

interface PortBase {
  /** Unique within the node, including inherited ports. */
  name: string;
  /**
   * What the port is for. Protocol details such as HTTP method and path or
   * a topic name go here or into `name`; there are no dedicated fields for them.
   */
  purpose: string;
  /**
   * How the port is reached, e.g. "in-process", "http", "grpc", "kafka".
   * Absent or "in-process": local, can only throw, never time out.
   * Anything else: crosses the network.
   */
  transport?: string;
  /**
   * The child port that handles this port; this is how a node exposes
   * something from inside its dome. `to` must be a direct child, and `port`
   * one of its ports (own or inherited) of the same kind.
   * A delegated port declares no shapes (input, output, errors, payload);
   * they come from the child port.
   * Not allowed on abstract nodes.
   */
  delegate?: { to: NodeId; port: string };
}

/** Request/response: the caller waits for the result. */
export interface CallPort extends PortBase {
  kind: "call";
  input?: Shape;
  output?: Shape;
  errors?: Shape[];
}

/** Fire-and-forget event published by this node. */
export interface EventPort extends PortBase {
  kind: "event";
  payload?: Shape;
}

/** Entry point others can depend on. */
export type Port = CallPort | EventPort;

// ─── Edges ───────────────────────────────────────────────────────────────
// Always stored on the dependent node.

/**
 * Depends on ports of another node: calls them, or listens to their events.
 * Scope: `to` must be a sibling (same parent) or a sibling of an ancestor.
 * Never a node inside another node's dome: that node must expose the port
 * via `delegate`. Top-level nodes (parent null, incl. externals) are thus
 * reachable from everywhere. Out-of-scope edges are invalid.
 * At most one `uses` edge per target node; `port` lists every port used there, never empty.
 * `to` may be an abstract node (depends on the contract) or an implementor,
 * including ports it inherited (depends on the implementation).
 * Which implementor is wired in at runtime is not modeled.
 */
export interface UsesEdge {
  kind: "uses";
  to: NodeId;
  port: string[];
}

/**
 * Fulfils the contract of an abstract node and inherits its ports.
 * It is an error if an own port has the same name as an inherited one,
 * or if two implemented abstract nodes declare ports with the same name.
 */
export interface ImplementsEdge {
  kind: "implements";
  to: NodeId;
}

export type Edge = UsesEdge | ImplementsEdge;

// ─── Spec content ────────────────────────────────────────────────────────

/**
 * Something the implementation must satisfy.
 * - requirement (default): what the node must achieve; observable at its ports.
 *   Should be demonstrated by at least one test case; one without is a gap.
 * - constraint: a guard rail on how it may be achieved. Tests are optional;
 *   otherwise it is checked by review.
 * Statements about the design go into `what` (what the node does) and `why`
 * (why the boundary exists, what belongs elsewhere), not here.
 */
export interface Requirement {
  /** Unique within the node, e.g. "R1". */
  id: string;
  kind?: "constraint";
  text: string;
}

export interface TestCase {
  /** Plain text: what is done and what is expected. */
  text: string;
  /** Requirement ids this test case demonstrates. A test case may demonstrate none. */
  demonstrates?: string[];
}

export interface Decision {
  decision: string;
  why: string;
  rejected?: { option: string; why: string }[];
}

// ─── Node ────────────────────────────────────────────────────────────────

export interface NodeSpec {
  // mandatory
  schema: "nuhokai/node@1";
  id: NodeId;
  name: string;
  /** Containing node, or null for top level. Must be null when external. */
  parent: NodeId | null;
  /** Not built by us. Externals never have children. */
  external: boolean;
  /**
   * A contract only: implemented by other nodes, never implemented itself.
   * Independent of `external`: an external contract is valid.
   * - Its ports are inherited by every implementor, never redeclared.
   * - Its requirements (incl. constraints) and testCases apply to every implementor.
   *   Its testCases are run against every implementor that is not external.
   * - Has no children, no `uses` edges, and does not `implements` another abstract node.
   * - Valid without any implementors.
   */
  abstract: boolean;
  /**
   * What the node does: its responsibility in a sentence or two, what it owns, takes in and produces.
   * Prose, not a list of ports or requirements: those say how it is reached and what must hold.
   * Not blank. E.g. "Counts what is on the shelf and holds stock for placed orders."
   */
  what: string;
  /**
   * Why the node exists: the reason for the boundary, the need it meets, and what it deliberately
   * does not do. Not blank. Required unless the node is external, whose reason is that it is not
   * built by us. E.g. "So Orders never oversells. Knows nothing of prices or orders themselves."
   */
  why?: string;
  /**
   * Where the node lives in code: paths or globs relative to the project directory (the folder holding nuhokai/),
   * e.g. ["src/billing/**"]. Empty while there is no code yet; always empty for externals.
   * There is no status field: whether a node is built is read from here, never claimed.
   */
  source: string[];

  // optional
  /** Entry points others can depend on. */
  ports?: Port[];
  /** Outgoing relations only. Parent-level edges are never stored. */
  edges?: Edge[];

  /**
   * Set when the node should no longer gain dependents: the note says why and what to use instead,
   * e.g. "use Stock.reserve". Not blank. Any node may carry it, an external, a contract or a dome too.
   * The node still exists and still works; `check` warns about every `uses` edge that reaches it, also through a
   * dome port or an inherited port, and about every node implementing it.
   */
  deprecated?: string;

  /** Groups sibling islands; shown as a pillar. Only meaningful among siblings. */
  group?: string;
  /** Externals only: picks how the external is drawn at the outer edge of the map. */
  externalType?: "caller" | "api" | "db";

  /** Requirements and constraints; see Requirement. */
  requirements?: Requirement[];
  /** How the requirements are shown to hold; kept current with the node, like every other field. */
  testCases?: TestCase[];
  /**
   * The design decisions that hold now, each with why and what was rejected.
   * Kept current: a changed decision is edited or replaced, never left beside
   * the one that overrides it.
   */
  decisions?: Decision[];
}
