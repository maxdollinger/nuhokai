import type { CallPort, EventPort, NodeSpec, Port } from "./node-spec.ts";

/**
 * Types of the world format (MAX-10): nodes as TS files whose edges are typed
 * references to other nodes, so `tsc` catches dangling references.
 *
 * Everything here is derived from the MAX-5 node spec (`nuhokai/node@1`);
 * only the fields the world format represents differently are replaced:
 * - `id` is a uuidv7 instead of a slug; `name` is not authored (the loader
 *   takes the export name); `schema` is implied.
 * - `parent`, `edges` and ports' `delegate` become lazy typed references.
 * - `ports` is a record keyed by port name instead of an array, so
 *   `Node.portName` resolves to the declaring key (go-to-definition, find references).
 *
 * A node is defined in two steps: `defineNode(static fields)` is generic and
 * infers the handle's type; `.edges(lazy references)` is not generic, so the
 * handle's type never depends on other nodes and reference cycles need no
 * annotations.
 *
 * The MAX-5 types live in `node-spec.ts`; all imports are type-only and erased at runtime.
 */

// ─── Brands ──────────────────────────────────────────────────────────────
// Type-only: declared, never defined, so nothing exists at runtime.
// The `#private` members make references nominal and spread-proof: neither
// strings, look-alike literals nor spreads of real references
// (`{ ...Stock.reserve, name: "x" }`) have them. Declaration emit erases a
// private member's type, so typed data lives in the symbol-keyed phantoms.

// biome-ignore lint/correctness/noUnusedPrivateClassMembers: the member is the brand
declare class NodeBrand {
  #node: true;
}
// biome-ignore lint/correctness/noUnusedPrivateClassMembers: the member is the brand
declare class PortBrand {
  #port: true;
}
// biome-ignore lint/correctness/noUnusedPrivateClassMembers: the member is the brand
declare class UnresolvedBrand {
  #unresolved: true;
}
declare const nodeFlags: unique symbol;

export type PortKind = Port["kind"];

/**
 * uuidv7, e.g. "01a16dd2-bc14-752c-b0df-585621a330ab". Stable across renames
 * and moves. Checked loosely (five groups, version nibble 7) to catch slugs;
 * full validation is the loader's job. Generate one with
 * `bun -e 'console.log(Bun.randomUUIDv7())'`.
 */
export type NodeUuid = `${string}-${string}-7${string}-${string}-${string}`;

/**
 * A type no value has; the message shows up in the compiler error,
 * e.g. "not assignable to type 'Forbidden<"external nodes have no parent">'".
 */
type Forbidden<Message extends string> = { readonly [K in Message]: never };

// ─── References ──────────────────────────────────────────────────────────

/**
 * Reference to a node; at runtime the handle returned by `.edges()`.
 * The type parameters are the node's static facts as literal types, so edges
 * can restrict which nodes they accept: its flags, its `id`, and `Impl`, the
 * ids of the contracts it implements (checked by `inherited`).
 */
export interface NodeRef<
  External extends boolean = boolean,
  Abstract extends boolean = boolean,
  Id extends NodeUuid = NodeUuid,
  Impl extends NodeUuid = never,
> extends NodeBrand {
  readonly [nodeFlags]: {
    readonly external: External;
    readonly abstract: Abstract;
    readonly id: Id;
    // A parameter, so a node implementing more contracts is still assignable.
    readonly implements: (contract: Impl) => void;
  };
  readonly $ref: "node";
  /** Both definition steps as authored, deep-frozen; edges stay lazy functions. */
  readonly $def: NodeDef & NodeEdges;
}

/** An own port of a node, e.g. `Orders.place`. */
export interface ResolvedPortRef<K extends PortKind = PortKind, Id extends NodeUuid = NodeUuid> extends PortBrand {
  readonly $ref: "port";
  readonly kind: K;
  /** The handle of the node declaring the port. */
  readonly node: NodeRef<boolean, boolean, Id>;
  /** The port's key in `ports`. */
  readonly name: string;
}

/** A port a node inherited from a contract it implements; see `inherited`. */
export interface InheritedPortRef<K extends PortKind = PortKind> extends PortBrand {
  readonly $ref: "inherited";
  readonly kind: K;
  /** The implementor. */
  readonly node: NodeRef;
  /** The contract's port. */
  readonly port: ResolvedPortRef<K>;
}

/**
 * A typed hole created by `tbd.call` / `tbd.event`: stands for a port that is
 * not designed yet. Accepted wherever a port reference is; the unresolved
 * brand and `$ref: "unresolved"` tell it apart from a real port.
 */
export interface UnresolvedPortRef<K extends PortKind = PortKind> extends PortBrand, UnresolvedBrand {
  readonly $ref: "unresolved";
  readonly kind: K;
  /** What the missing port has to do. */
  readonly description: string;
}

/** What `tbd.call` / `tbd.event` return. */
export type TbdPortRef<K extends PortKind = PortKind> = UnresolvedPortRef<K>;

/** A real, inherited or placeholder port. Discriminate on `$ref`. */
export type PortRef<K extends PortKind = PortKind> = ResolvedPortRef<K> | InheritedPortRef<K> | UnresolvedPortRef<K>;
export type CallRef = PortRef<"call">;
export type EventRef = PortRef<"event">;
/** Neither external nor abstract nodes can contain other nodes. */
export type ParentRef = NodeRef<false, false>;

// ─── Definitions ─────────────────────────────────────────────────────────

/** `T` with every object and array readonly, so `as const` fragments are accepted. */
type Authored<T> = T extends readonly (infer U)[]
  ? readonly Authored<U>[]
  : T extends object
    ? { readonly [K in keyof T]: Authored<T[K]> }
    : T;

/** MAX-5 `CallPort` without `name` (the record key); `delegate` moves to `.edges()`. */
export interface WorldCallPort extends Authored<Omit<CallPort, "name" | "delegate">> {}

/** MAX-5 `EventPort` without `name` (the record key); `delegate` moves to `.edges()`. */
export interface WorldEventPort extends Authored<Omit<EventPort, "name" | "delegate">> {}

export type WorldPort = WorldCallPort | WorldEventPort;

/**
 * Ports keyed by name. Names starting with `$` are reserved for the handle's
 * own properties (`$ref`, `$def`).
 */
export type PortsDef = { readonly [name: string]: WorldPort } & { readonly [name: `$${string}`]: never };

/** MAX-5 fields the world format replaces or derives. */
type Replaced = "schema" | "id" | "name" | "parent" | "external" | "abstract" | "ports" | "edges";

/**
 * Step one of a node, the argument of `defineNode`: its static fields.
 * All fields not declared here are MAX-5 `NodeSpec` fields.
 */
export interface NodeDef<
  P extends PortsDef = PortsDef,
  External extends boolean = boolean,
  Abstract extends boolean = boolean,
  Id extends NodeUuid = NodeUuid,
  Impl extends NodeUuid = NodeUuid,
> extends Authored<Omit<NodeSpec, Replaced>> {
  readonly id: Id;
  /** Defaults to false. */
  readonly external?: External;
  /** Defaults to false. */
  readonly abstract?: Abstract;
  readonly ports?: P;
  /**
   * MAX-5 `implements` edges: the abstract nodes whose contract this node
   * fulfils. Lazy like every edge, but part of step one because the handle's
   * type records the contracts (see `inherited`); contracts reference no other
   * node in step one, so this never forms a type cycle.
   */
  readonly implements?: () => readonly NodeRef<boolean, true, Impl>[];
}

/**
 * Delegates keyed by own port name; the target has the port's kind.
 * Without ports this would be `{}`, which accepts any key.
 */
type Delegates<P extends PortsDef> = [keyof P] extends [never]
  ? Forbidden<"a node without ports has nothing to delegate">
  : {
      readonly [K in keyof P]?: Extract<keyof P[K], "input" | "output" | "errors" | "payload"> extends never
        ? () => PortRef<P[K]["kind"]>
        : Forbidden<"a delegated port declares no input, output, errors or payload">;
    };

/** Step two of a node, the argument of `.edges()`: lazy references to other nodes. */
export interface NodeEdges {
  /** Containing node; absent means top level. The child declares where it lives. */
  readonly parent?: () => ParentRef;
  /** MAX-5 `uses` edges: every port this node depends on. The loader groups them by node. */
  readonly uses?: () => readonly PortRef[];
  /**
   * MAX-5 ports' `delegate`, keyed by own port name: the direct child's port
   * that handles it, e.g. `{ placeOrder: () => Orders.place }`.
   */
  readonly delegate?: { readonly [port: string]: () => PortRef };
}

// ─── Compile-time rules ──────────────────────────────────────────────────
// MAX-5 rules that the literal flags and port names make cheap to check.
// Unknown (`boolean`) flags are treated as possibly true.

/** Port-name rules, intersected with `ports`. */
export type PortRules<P> = string extends keyof P
  ? Forbidden<"ports need literal names: pass the record inline or `as const`">
  : ("" extends keyof P ? { readonly "": Forbidden<"port names must not be empty"> } : unknown) &
      ("__proto__" extends keyof P ? { readonly __proto__: Forbidden<"`__proto__` is not a port name"> } : unknown);

/** Flag rules for step one. */
export type DefRules<External extends boolean, Abstract extends boolean> = (true extends External
  ? unknown
  : { readonly externalType?: Forbidden<"externalType is for external nodes only"> }) &
  (true extends Abstract ? { readonly implements?: Forbidden<"abstract nodes implement no other node"> } : unknown);

/** Step two, with the rules that depend on step one. */
export type EdgesOf<P extends PortsDef, External extends boolean, Abstract extends boolean> = Omit<
  NodeEdges,
  "delegate"
> & { readonly delegate?: Delegates<P> } & (true extends External
    ? { readonly parent?: Forbidden<"external nodes have no parent"> }
    : unknown) &
  (true extends Abstract
    ? {
        readonly uses?: Forbidden<"abstract nodes have no uses edges">;
        readonly delegate?: Forbidden<"abstract nodes do not delegate">;
      }
    : unknown);

// ─── Handles ─────────────────────────────────────────────────────────────

/** What `defineNode` returns. Not a node yet: call `.edges()`, also with `{}`. */
export interface NodeDraft<
  P extends PortsDef,
  External extends boolean,
  Abstract extends boolean,
  Id extends NodeUuid,
  Impl extends NodeUuid,
> {
  readonly $ref: "draft";
  /** Adds the lazy edges and returns the node's handle. */
  edges(edges: EdgesOf<P, External, Abstract>): NodeHandle<P, External, Abstract, Id, Impl>;
}

/** A node reference with one property per own port. */
export type NodeHandle<
  P extends PortsDef,
  External extends boolean,
  Abstract extends boolean,
  Id extends NodeUuid,
  Impl extends NodeUuid,
> = NodeRef<External, Abstract, Id, Impl> & { readonly [K in keyof P]: ResolvedPortRef<P[K]["kind"], Id> };

// ─── Sync with MAX-5 ─────────────────────────────────────────────────────
// Fails to compile if the world format drops or duplicates a MAX-5 field.

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _nodeFieldsInSync: Equals<
  keyof NodeDef | keyof NodeEdges | "schema" | "name" | "edges",
  keyof NodeSpec | "implements" | "uses" | "delegate"
> = true;
const _callFieldsInSync: Equals<keyof WorldCallPort | "name" | "delegate", keyof CallPort> = true;
const _eventFieldsInSync: Equals<keyof WorldEventPort | "name" | "delegate", keyof EventPort> = true;
void _nodeFieldsInSync;
void _callFieldsInSync;
void _eventFieldsInSync;
