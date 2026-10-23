import Type, { type Static } from "typebox";

/**
 * Node spec, schema `nuhokai/node@1` (MAX-5). One node = one file: `<id>.json`.
 * Readers are strict: unknown fields or edge kinds make a node invalid.
 * Format changes bump `schema` and migrate existing files.
 *
 * Each plain type is followed by its TypeBox schema; the compile-time check
 * at the end fails if they drift apart. The schema checks the shape of a
 * single node (E1, the id pattern of E2, E9, and E11's non-empty, duplicate-free
 * `port`); the other MAX-5 validation rules relate fields or nodes to each
 * other and are not checked here.
 */

export const NODE_SCHEMA = "nuhokai/node@1";

/** Stable slug, unique within the world. Also the file name. */
export type NodeId = string;
export const NodeIdSchema = Type.String({ pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" });

/**
 * Prose description of data crossing a boundary, e.g.
 * "order id and requested quantity".
 * Deliberately not a type system: the implementing agent derives the
 * concrete shape, reading the callee's code where it already exists.
 */
export type Shape = string;
const ShapeSchema = Type.String();

// ─── Status ──────────────────────────────────────────────────────────────

/**
 * planned:    designed, no code yet
 * building:   implementation in progress
 * built:      implemented and matching this spec
 * deprecated: still exists, should no longer gain dependents
 *
 * "planned" and "building" are set by the game; "built" and "deprecated"
 * only manually. At the end of a quest, every node the quest created or
 * changed is set to "building", including built nodes. Any change counts.
 */
export type NodeStatus = "planned" | "building" | "built" | "deprecated";
export const NodeStatusSchema = Type.Union([
  Type.Literal("planned"),
  Type.Literal("building"),
  Type.Literal("built"),
  Type.Literal("deprecated"),
]);

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

const portBaseProperties = {
  name: Type.String({ minLength: 1 }),
  purpose: Type.String(),
  transport: Type.Optional(Type.String({ minLength: 1 })),
  delegate: Type.Optional(
    Type.Object({ to: NodeIdSchema, port: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
  ),
};

/** Request/response: the caller waits for the result. */
export interface CallPort extends PortBase {
  kind: "call";
  input?: Shape;
  output?: Shape;
  errors?: Shape[];
}
export const CallPortSchema = Type.Object(
  {
    kind: Type.Literal("call"),
    ...portBaseProperties,
    input: Type.Optional(ShapeSchema),
    output: Type.Optional(ShapeSchema),
    errors: Type.Optional(Type.Array(ShapeSchema)),
  },
  { additionalProperties: false },
);

/** Fire-and-forget event published by this node. */
export interface EventPort extends PortBase {
  kind: "event";
  payload?: Shape;
}
export const EventPortSchema = Type.Object(
  {
    kind: Type.Literal("event"),
    ...portBaseProperties,
    payload: Type.Optional(ShapeSchema),
  },
  { additionalProperties: false },
);

/** Entry point others can depend on. */
export type Port = CallPort | EventPort;
export const PortSchema = Type.Union([CallPortSchema, EventPortSchema]);

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
export const UsesEdgeSchema = Type.Object(
  {
    kind: Type.Literal("uses"),
    to: NodeIdSchema,
    port: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
  },
  { additionalProperties: false },
);

/**
 * Fulfils the contract of an abstract node and inherits its ports.
 * It is an error if an own port has the same name as an inherited one,
 * or if two implemented abstract nodes declare ports with the same name.
 */
export interface ImplementsEdge {
  kind: "implements";
  to: NodeId;
}
export const ImplementsEdgeSchema = Type.Object(
  { kind: Type.Literal("implements"), to: NodeIdSchema },
  { additionalProperties: false },
);

export type Edge = UsesEdge | ImplementsEdge;
export const EdgeSchema = Type.Union([UsesEdgeSchema, ImplementsEdgeSchema]);

// ─── Spec content ────────────────────────────────────────────────────────

/**
 * Something the implementation must satisfy.
 * - requirement (default): what the node must achieve; observable at its ports.
 *   Should be demonstrated by at least one test case; one without is a gap.
 * - constraint: a guard rail on how it may be achieved. Tests are optional;
 *   otherwise it is checked by review.
 * Statements about the design (why the boundary exists, what belongs elsewhere)
 * go into `purpose`, not here.
 */
export interface Requirement {
  /** Unique within the node, e.g. "R1". */
  id: string;
  kind?: "constraint";
  text: string;
}
export const RequirementSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    kind: Type.Optional(Type.Literal("constraint")),
    text: Type.String(),
  },
  { additionalProperties: false },
);

export interface TestCase {
  /** Plain text: what is done and what is expected. */
  text: string;
  /** Requirement ids this test case demonstrates. A test case may demonstrate none. */
  demonstrates?: string[];
}
export const TestCaseSchema = Type.Object(
  {
    text: Type.String(),
    demonstrates: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  },
  { additionalProperties: false },
);

export interface Decision {
  decision: string;
  why: string;
  rejected?: { option: string; why: string }[];
}
export const DecisionSchema = Type.Object(
  {
    decision: Type.String(),
    why: Type.String(),
    rejected: Type.Optional(
      Type.Array(Type.Object({ option: Type.String(), why: Type.String() }, { additionalProperties: false })),
    ),
  },
  { additionalProperties: false },
);

// ─── Node ────────────────────────────────────────────────────────────────

export interface NodeSpec {
  // mandatory
  schema: typeof NODE_SCHEMA;
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
  /** Why this node exists: the reason for the boundary, and what it deliberately does not do. */
  purpose: string;
  /**
   * Lifecycle of the node. Applies to externals too: an external may still need to be built.
   * Independent of the parent's status, e.g. a built parent can have planned children.
   */
  status: NodeStatus;
  /**
   * Where the node lives in code: paths or globs relative to the repo root,
   * e.g. ["src/billing/**"]. Empty while there is no code yet; always empty for externals.
   */
  source: string[];

  // optional
  /** Entry points others can depend on. */
  ports?: Port[];
  /** Outgoing relations only. Parent-level edges are never stored. */
  edges?: Edge[];

  /** Groups sibling islands; shown as a pillar. Only meaningful among siblings. */
  group?: string;
  /** Externals only: picks how the external is drawn at the outer edge of the map. */
  externalType?: "caller" | "api" | "db";

  /** Requirements and constraints; see Requirement. */
  requirements?: Requirement[];
  /**
   * Append-only. A test case's id is its zero-based array index, so entries
   * are never removed or reordered.
   */
  testCases?: TestCase[];
  /**
   * Append-only log; a decision's id is its zero-based array index.
   * Entries are never removed, edited or reordered. When decisions conflict,
   * the later one wins.
   */
  decisions?: Decision[];
}

export const NodeSpecSchema = Type.Object(
  {
    schema: Type.Literal(NODE_SCHEMA),
    id: NodeIdSchema,
    name: Type.String({ minLength: 1 }),
    parent: Type.Union([NodeIdSchema, Type.Null()]),
    external: Type.Boolean(),
    abstract: Type.Boolean(),
    purpose: Type.String(),
    status: NodeStatusSchema,
    source: Type.Array(Type.String({ minLength: 1 })),
    ports: Type.Optional(Type.Array(PortSchema)),
    edges: Type.Optional(Type.Array(EdgeSchema)),
    group: Type.Optional(Type.String({ minLength: 1 })),
    externalType: Type.Optional(Type.Union([Type.Literal("caller"), Type.Literal("api"), Type.Literal("db")])),
    requirements: Type.Optional(Type.Array(RequirementSchema)),
    testCases: Type.Optional(Type.Array(TestCaseSchema)),
    decisions: Type.Optional(Type.Array(DecisionSchema)),
  },
  { $id: "NodeSpec", additionalProperties: false },
);

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _portInSync: Equals<Port, Static<typeof PortSchema>> = true;
const _edgeInSync: Equals<Edge, Static<typeof EdgeSchema>> = true;
const _nodeSpecInSync: Equals<NodeSpec, Static<typeof NodeSpecSchema>> = true;
void _portInSync;
void _edgeInSync;
void _nodeSpecInSync;
