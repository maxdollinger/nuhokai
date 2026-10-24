import type { CallPort, EventPort, NodeId, NodeSpec, Port } from "./node-spec.ts";

export type { NodeId };

/**
 * Types of the world format (MAX-10): nodes as TS files whose edges are typed
 * references to other nodes, so `tsc` catches dangling references.
 *
 * Everything here is derived from the MAX-5 node spec (`nuhokai/node@1`);
 * only the fields the world format represents differently are replaced:
 * - `id` is any string, kept as a literal type on the handle; `name` is not
 *   authored (the loader takes the export name); `schema` is implied.
 * - `edges` and ports' `delegate` become lazy typed references.
 * - `parent` is not a node field: the world file places every node with
 *   `defineWorld` and `relation` (MAX-12).
 * - `ports` is a record keyed by port name instead of an array, so
 *   `Node.portName` resolves to the declaring key (go-to-definition, find references).
 *
 * A node is defined in two steps: `defineNode(static fields)` is generic and
 * infers the handle's type; `.edges(lazy references)` is not generic, so the
 * handle's type depends only on the contracts it implements and the children
 * it delegates to, never on a node that could point back, and reference cycles
 * need no annotations.
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
// biome-ignore lint/correctness/noUnusedPrivateClassMembers: the member is the brand
declare class RelationBrand {
  #relation: true;
}
// biome-ignore lint/correctness/noUnusedPrivateClassMembers: the member is the brand
declare class WorldBrand {
  #world: true;
}
declare const nodeFlags: unique symbol;

export type PortKind = Port["kind"];

/**
 * A type no value has; the message shows up in the compiler error,
 * e.g. "not assignable to type 'Forbidden<"external nodes cannot be parents">'".
 */
export type Forbidden<Message extends string> = { readonly [K in Message]: never };

// ─── References ──────────────────────────────────────────────────────────

/** Own port name -> id of the node it delegates to (`never` for a placeholder). */
export type DelegateIds = { readonly [port: string]: NodeId };

/**
 * Reference to a node; at runtime the handle returned by `.edges()`.
 * The type parameters are the node's static facts as literal types, so edges
 * and relations can restrict which nodes they accept: its flags, its `id`,
 * `Impl`, the ids of the contracts it implements (checked by `inherited`), and
 * `Delegates`, the nodes its ports delegate to (checked by `relation`).
 */
export interface NodeRef<
  External extends boolean = boolean,
  Abstract extends boolean = boolean,
  Id extends NodeId = NodeId,
  Impl extends NodeId = never,
  Delegates extends DelegateIds = DelegateIds,
> extends NodeBrand {
  readonly [nodeFlags]: {
    readonly external: External;
    readonly abstract: Abstract;
    readonly id: Id;
    // A parameter, so a node implementing more contracts is still assignable.
    readonly implements: (contract: Impl) => void;
    readonly delegates: Delegates;
  };
  readonly $ref: "node";
  /** Both definition steps as authored, deep-frozen; edges stay lazy functions. */
  readonly $def: NodeDef & NodeEdges;
}

/** An own port of a node, e.g. `Orders.place`. */
export interface ResolvedPortRef<K extends PortKind = PortKind, Id extends NodeId = NodeId> extends PortBrand {
  readonly $ref: "port";
  readonly kind: K;
  /** The handle of the node declaring the port. */
  readonly node: NodeRef<boolean, boolean, Id>;
  /** The port's key in `ports`. */
  readonly name: string;
}

/** A port a node inherited from a contract it implements; see `inherited`. */
export interface InheritedPortRef<K extends PortKind = PortKind, Id extends NodeId = NodeId> extends PortBrand {
  readonly $ref: "inherited";
  readonly kind: K;
  /** The implementor. */
  readonly node: NodeRef<boolean, boolean, Id>;
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
export type ParentRef<Id extends NodeId = NodeId> = NodeRef<false, false, Id>;
/** A node that can be implemented. */
export type ContractRef = NodeRef<boolean, true>;

/** The literal id of a node reference. */
export type NodeIdOf<N> = N extends { readonly [nodeFlags]: { readonly id: infer Id extends NodeId } } ? Id : never;

// ─── Definitions ─────────────────────────────────────────────────────────

/** `T` with every object and array readonly, so `as const` fragments are accepted. */
type Authored<T> = T extends readonly (infer U)[]
  ? readonly Authored<U>[]
  : T extends object
    ? { readonly [K in keyof T]: Authored<T[K]> }
    : T;

/** MAX-5 `CallPort` without `name` (the record key); `delegate` moves to the node's `delegate`. */
export interface WorldCallPort extends Authored<Omit<CallPort, "name" | "delegate">> {}

/** MAX-5 `EventPort` without `name` (the record key); `delegate` moves to the node's `delegate`. */
export interface WorldEventPort extends Authored<Omit<EventPort, "name" | "delegate">> {}

export type WorldPort = WorldCallPort | WorldEventPort;

/**
 * Ports keyed by name. Names starting with `$` are reserved for the handle's
 * own properties (`$ref`, `$def`).
 */
export type PortsDef = { readonly [name: string]: WorldPort } & { readonly [name: `$${string}`]: never };

/** MAX-5 fields the world format replaces or derives. */
type Replaced =
  | "schema"
  | "id"
  | "name"
  | "parent"
  | "external"
  | "abstract"
  | "ports"
  | "edges"
  | "requirements"
  | "testCases";

/** MAX-5 `requirements`, authored. */
export type RequirementsDef = Authored<NonNullable<NodeSpec["requirements"]>>;
/** MAX-5 `testCases`, authored. */
export type TestCasesDef = Authored<NonNullable<NodeSpec["testCases"]>>;

/** Lazy MAX-5 `implements` edges; an alias, so that `NodeRules` can repeat the exact type. */
export type Implements<Contracts extends readonly ContractRef[]> = () => Contracts;

/** Delegates keyed by own port name; each returns the direct child's port that handles it. */
export type DelegatesDef = { readonly [port: string]: () => PortRef };

/**
 * Step one of a node, the argument of `defineNode`: its static fields.
 * All fields not declared here are MAX-5 `NodeSpec` fields.
 */
export interface NodeDef<
  P extends PortsDef = PortsDef,
  External extends boolean = boolean,
  Abstract extends boolean = boolean,
  Id extends NodeId = NodeId,
  Contracts extends readonly ContractRef[] = readonly ContractRef[],
  D extends DelegatesDef = DelegatesDef,
  R extends RequirementsDef = RequirementsDef,
  T extends TestCasesDef = TestCasesDef,
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
   * type records the contracts (see `inherited`) and their ports are checked
   * against the own ports; contracts reference no other node in step one, so
   * this never forms a type cycle.
   */
  readonly implements?: Implements<Contracts>;
  /**
   * MAX-5 ports' `delegate`, keyed by own port name: the direct child's port
   * that handles it, e.g. `{ placeOrder: () => Orders.place }`. Part of step
   * one because the handle's type records the targets, which `relation`
   * checks against the parent's children. Delegation only points down to
   * direct children, so this never forms a type cycle.
   */
  readonly delegate?: D;
  /** MAX-5 `requirements`; a type parameter, so that tsc can check the ids. */
  readonly requirements?: R;
  /** MAX-5 `testCases`; a type parameter, so that tsc can check `demonstrates`. */
  readonly testCases?: T;
}

/** Step two of a node, the argument of `.edges()`: lazy references to other nodes. */
export interface NodeEdges {
  /**
   * MAX-5 `uses` edges: every port this node depends on. The loader groups them
   * by node and checks the scope against the world tree. Not in step one:
   * `uses` may point anywhere, also back, so it would form type cycles (TS7022).
   */
  readonly uses?: () => readonly PortRef[];
}

// ─── Compile-time rules ──────────────────────────────────────────────────
// MAX-5 rules that the literal flags, ids and port names make cheap to check,
// each failing on the offending element. Unknown (`boolean`) flags are treated
// as possibly true. Rules are wrapped in `NoInfer`, so they never steer
// inference, and are `unknown` while satisfied: a tuple intersected with a
// rule tuple is also compared method by method, which made checking a
// 200-node world about four times slower (2.2s instead of 0.6s). That is why
// list rules come in pairs: a cheap check whether anything is wrong, and the
// per-element rule tuple, built only if so.

/** Port-name rules, intersected with `ports`. */
export type PortRules<P> = string extends keyof P
  ? Forbidden<"ports need literal names: pass the record inline or `as const`">
  : ("" extends keyof P ? { readonly "": Forbidden<"port names must not be empty"> } : unknown) &
      ("__proto__" extends keyof P ? { readonly __proto__: Forbidden<"`__proto__` is not a port name"> } : unknown);

/** Flag rules for step one. */
export type DefRules<External extends boolean, Abstract extends boolean> = (true extends External
  ? { readonly delegate?: Forbidden<"external nodes have no children to delegate to"> }
  : { readonly externalType?: Forbidden<"externalType is for external nodes only"> }) &
  (true extends Abstract
    ? {
        readonly implements?: Forbidden<"abstract nodes implement no other node">;
        readonly delegate?: Forbidden<"abstract nodes do not delegate">;
      }
    : unknown);

/** A contract's port names: the handle's keys minus the reference's own. Distributes; `never` has none. */
type PortNamesOf<N> = N extends unknown ? Exclude<keyof N, keyof NodeRef> & string : never;

/** A contract's literal id; `never` for a widened reference (left to the loader). */
type ContractIdOf<N> = NodeId extends NodeIdOf<N> ? never : NodeIdOf<N>;
/** Whether an earlier contract in `implements` has the same literal id. */
type ListedBefore<N, SeenIds extends string> = [ContractIdOf<N>] extends [never]
  ? false
  : [ContractIdOf<N>] extends [SeenIds]
    ? true
    : false;

/** Ids of contracts listed twice and port names that two contracts in `implements` declare. */
type ContractClashNames<
  Contracts extends readonly unknown[],
  Seen extends string = never,
  SeenIds extends string = never,
> = Contracts extends readonly [infer Head, ...infer Tail]
  ? ListedBefore<Head, SeenIds> extends true
    ? ContractIdOf<Head> | ContractClashNames<Tail, Seen, SeenIds>
    :
        | Extract<PortNamesOf<Head>, Seen>
        | ContractClashNames<Tail, Seen | PortNamesOf<Head>, SeenIds | ContractIdOf<Head>>
  : never;

/** Per contract: listed already, or which of its port names an earlier contract in `implements` declares. */
type ContractClashes<
  Contracts extends readonly unknown[],
  Seen extends string = never,
  SeenIds extends string = never,
> = Contracts extends readonly [infer Head, ...infer Tail]
  ? ListedBefore<Head, SeenIds> extends true
    ? readonly [Forbidden<"this contract is listed twice in implements">, ...ContractClashes<Tail, Seen, SeenIds>]
    : readonly [
        [Extract<PortNamesOf<Head>, Seen>] extends [never]
          ? unknown
          : Forbidden<`\`${Extract<PortNamesOf<Head>, Seen>}\`: two implemented contracts must not share a port name`>,
        ...ContractClashes<Tail, Seen | PortNamesOf<Head>, SeenIds | ContractIdOf<Head>>,
      ]
  : readonly unknown[];

/** The contracts with their clash rules; a type argument of `NodeDef` in `defineNode`. */
export type CheckedContracts<Contracts extends readonly ContractRef[]> = Contracts &
  NoInfer<[ContractClashNames<Contracts>] extends [never] ? unknown : ContractClashes<Contracts>>;

/**
 * `implements` again, but required, if a contract clashes: TypeScript only
 * points at the offending array element when the property is not optional.
 */
type ContractRules<Contracts extends readonly ContractRef[]> = [ContractClashNames<Contracts>] extends [never]
  ? unknown
  : { readonly implements: Implements<CheckedContracts<Contracts>> };

/** An own port must not have the name of a port inherited from an implemented contract. */
type InheritedPortRules<P, Contracts extends readonly ContractRef[]> = [
  Extract<keyof P, PortNamesOf<Contracts[number]>>,
] extends [never]
  ? unknown
  : {
      readonly [K in Extract<
        keyof P,
        PortNamesOf<Contracts[number]>
      >]: Forbidden<`\`${K}\` is inherited from an implemented contract; an own port must not have its name`>;
    };

/**
 * Delegate keys are own port names; the target has the port's kind, and the
 * port declares no shapes. An inherited port cannot delegate: in MAX-5,
 * `delegate` is a field of a port the node declares itself.
 */
type DelegateRules<P extends PortsDef, D, Contracts extends readonly ContractRef[]> = {
  readonly [K in keyof D]: K extends keyof P
    ? Extract<keyof P[K], "input" | "output" | "errors" | "payload"> extends never
      ? () => PortRef<P[K]["kind"]>
      : Forbidden<"a delegated port declares no input, output, errors or payload">
    : K extends PortNamesOf<Contracts[number]>
      ? Forbidden<`\`${K}\` is inherited from an implemented contract; only own ports delegate`>
      : [keyof P] extends [never]
        ? Forbidden<"a node without ports has nothing to delegate">
        : Forbidden<"delegate keys are the node's own port names">;
};

/** The node id each delegate points to; `never` for a placeholder. Recorded on the handle. */
export type DelegateTargets<D> = {
  readonly [K in keyof D]: D[K] extends () => infer Ref
    ? NodeIdOf<Ref extends { readonly node: infer N } ? N : never>
    : never;
};

/** Requirement ids that occur more than once. */
type DuplicateRequirementIds<R extends readonly unknown[], Seen = never> = R extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends { readonly id: infer Id extends string }
    ? string extends Id
      ? DuplicateRequirementIds<Tail, Seen>
      : Extract<Id, Seen> | DuplicateRequirementIds<Tail, Seen | Id>
    : DuplicateRequirementIds<Tail, Seen>
  : never;

/** Per requirement, whether an earlier one has the same id. A non-literal id is left to the loader. */
type UniqueRequirementIds<R extends readonly unknown[], Seen = never> = R extends readonly [infer Head, ...infer Tail]
  ? readonly [
      Head extends { readonly id: infer Id extends string }
        ? [Id] extends [Seen]
          ? { readonly id: Forbidden<`requirement id \`${Id}\` is used twice`> }
          : unknown
        : unknown,
      ...UniqueRequirementIds<
        Tail,
        Seen | (Head extends { readonly id: infer Id extends string } ? (string extends Id ? never : Id) : never)
      >,
    ]
  : readonly unknown[];

/** The requirements with the uniqueness rule; a type argument of `NodeDef` in `defineNode`. */
export type CheckedRequirements<R extends RequirementsDef> = R &
  NoInfer<[DuplicateRequirementIds<R>] extends [never] ? unknown : UniqueRequirementIds<R>>;

type DemonstratesOf<T> = T extends { readonly demonstrates?: infer D extends readonly string[] } ? D : readonly [];
/** Demonstrated ids that are not in `Ids`; a non-literal id is left to the loader. */
type UnknownIds<D extends readonly string[], Ids> = D[number] extends infer Id
  ? Id extends Ids
    ? never
    : string extends Id
      ? never
      : Id
  : never;
type DemonstratesRules<D, Ids> = {
  readonly [I in keyof D]: D[I] extends Ids
    ? unknown
    : string extends D[I]
      ? unknown
      : Forbidden<`\`${D[I] & string}\` is not one of this node's requirement ids`>;
};
type TestCaseRules<T, Ids> = {
  readonly [I in keyof T]: [UnknownIds<DemonstratesOf<T[I]>, Ids>] extends [never]
    ? unknown
    : { readonly demonstrates?: DemonstratesRules<DemonstratesOf<T[I]>, Ids> };
};

/**
 * The test cases with the `demonstrates` rule, a type argument of `NodeDef` in
 * `defineNode`: only own requirement ids. Whether an implementor may
 * demonstrate a contract's requirement is open (MAX-5 is silent).
 */
export type CheckedTestCases<T extends TestCasesDef, R extends RequirementsDef> = T &
  NoInfer<
    [UnknownIds<DemonstratesOf<T[number]>, R[number]["id"]>] extends [never]
      ? unknown
      : TestCaseRules<T, R[number]["id"]>
  >;

/**
 * The step-one rules not carried by the type arguments of `NodeDef`,
 * intersected with the argument of `defineNode`.
 */
export type NodeRules<
  P extends PortsDef,
  External extends boolean,
  Abstract extends boolean,
  Contracts extends readonly ContractRef[],
  D extends DelegatesDef,
> = {
  readonly ports?: PortRules<P> & NoInfer<InheritedPortRules<P, Contracts>>;
  readonly delegate?: NoInfer<DelegateRules<P, D, Contracts>>;
} & NoInfer<ContractRules<Contracts>> &
  DefRules<External, Abstract>;

/** Step two, with the rules that depend on step one. */
export type EdgesOf<Abstract extends boolean> = NodeEdges &
  (true extends Abstract ? { readonly uses?: Forbidden<"abstract nodes have no uses edges"> } : unknown);

// ─── Handles ─────────────────────────────────────────────────────────────

/** What `defineNode` returns. Not a node yet: call `.edges()`, also with `{}`. */
export interface NodeDraft<
  P extends PortsDef,
  External extends boolean,
  Abstract extends boolean,
  Id extends NodeId,
  Impl extends NodeId,
  Delegates extends DelegateIds,
> {
  readonly $ref: "draft";
  /** Adds the lazy edges and returns the node's handle. */
  edges(edges: EdgesOf<Abstract>): NodeHandle<P, External, Abstract, Id, Impl, Delegates>;
}

/** A node reference with one property per own port. */
export type NodeHandle<
  P extends PortsDef,
  External extends boolean,
  Abstract extends boolean,
  Id extends NodeId,
  Impl extends NodeId,
  Delegates extends DelegateIds,
> = NodeRef<External, Abstract, Id, Impl, Delegates> & { readonly [K in keyof P]: ResolvedPortRef<P[K]["kind"], Id> };

// ─── World ───────────────────────────────────────────────────────────────
// The hierarchy, in one place: the world file lists every node, nested with
// `relation`. Node files never import it, so it adds no import cycles.

/** A parent and its direct children, created by `relation`. Its type keeps the parent's id. */
export interface RelationRef<Id extends NodeId = NodeId> extends RelationBrand {
  readonly $ref: "relation";
  readonly parent: ParentRef<Id>;
  readonly children: readonly WorldChild[];
}

/** An entry of `children`: a node without children, or a relation. */
export type WorldChild = NodeRef | RelationRef;

/** The world, created by `defineWorld`: exactly the nodes listed in its tree. */
export interface World extends WorldBrand {
  readonly $ref: "world";
  /** Top-level nodes and relations. */
  readonly children: readonly WorldChild[];
}

type FlagsOf<N> = N extends { readonly [nodeFlags]: infer Flags } ? Flags : never;
type ExternalOf<N> = FlagsOf<N> extends { readonly external: infer E } ? E : never;
type AbstractOf<N> = FlagsOf<N> extends { readonly abstract: infer A } ? A : never;
type DelegatesOf<N> = FlagsOf<N> extends { readonly delegates: infer D } ? D : never;

/** Own ports that delegate to a node (not to a placeholder). */
type DelegatingPorts<N> = {
  [K in keyof DelegatesOf<N>]: [DelegatesOf<N>[K]] extends [never] ? never : K;
}[keyof DelegatesOf<N>] &
  string;

/** Why a `parent` or child entry is not a node at all. */
type NotANode<V, Position extends "parent" | "child"> = V extends string
  ? Forbidden<`a ${Position} is a node reference, not a string`>
  : V extends { readonly $ref: "draft" }
    ? Forbidden<"a draft is not a node: call .edges(), also with {}">
    : V extends PortRef
      ? Forbidden<`a ${Position} is a node, not a port`>
      : Position extends "parent"
        ? Forbidden<"a parent is a node from defineNode(...).edges(...)">
        : Forbidden<"a child is a node from defineNode(...).edges(...) or a relation(...)">;

/** The id of a child entry: the node's, or a nested relation's parent's. */
type ChildId<C> = C extends RelationRef<infer Id> ? Id : NodeIdOf<C>;

/**
 * `relation.parent` must be a `NodeRef<false, false>` with statically known
 * flags, and every delegate target must be one of `Children`.
 */
export type ParentRules<Parent, Children extends readonly unknown[]> = [Parent] extends [NodeRef]
  ? ([ExternalOf<Parent>] extends [false]
      ? unknown
      : [ExternalOf<Parent>] extends [true]
        ? Forbidden<"external nodes cannot be parents: they are top level only">
        : Forbidden<"this node may be external (its flag is not a literal), so it cannot be a parent">) &
      ([AbstractOf<Parent>] extends [false]
        ? unknown
        : [AbstractOf<Parent>] extends [true]
          ? Forbidden<"abstract nodes cannot be parents">
          : Forbidden<"this node may be abstract (its flag is not a literal), so it cannot be a parent">) &
      (string extends keyof DelegatesOf<Parent>
        ? unknown
        : {
              [K in DelegatingPorts<Parent>]: DelegatesOf<Parent>[K] extends ChildId<Children[number]> ? never : K;
            }[DelegatingPorts<Parent>] extends infer Missing extends string
          ? [Missing] extends [never]
            ? unknown
            : Forbidden<`\`${Missing}\` delegates to a node that is not one of this relation's children`>
          : unknown)
  : NotANode<Parent, "parent">;

/**
 * Why a node cannot be a child here, as messages; `never` if it can.
 * Distributes, so each node of a union (an inferred mixed array) is judged
 * by its own flags.
 */
type NodeChildProblems<C, In extends "world" | "relation"> = C extends unknown
  ?
      | (In extends "world"
          ? never
          : [ExternalOf<C>] extends [false]
            ? never
            : [ExternalOf<C>] extends [true]
              ? "external nodes are top level only: list them in defineWorld's children"
              : "this node may be external (its flag is not a literal), so it can only be top level")
      | (string extends keyof DelegatesOf<C>
          ? never
          : [DelegatingPorts<C>] extends [never]
            ? never
            : "this node delegates to its children, so it must be the parent of a relation(...)")
  : never;

/** A child is a relation, or a node; also a union of both, e.g. `WorldChild`. */
type ChildRule<C, In extends "world" | "relation"> = [C] extends [RelationRef]
  ? unknown
  : [C] extends [WorldChild]
    ? [NodeChildProblems<Exclude<C, RelationRef>, In>] extends [never]
      ? unknown
      : Forbidden<NodeChildProblems<Exclude<C, RelationRef>, In>>
    : NotANode<C, "child">;

/** Whether any child breaks a rule. */
type HasChildErrors<Children extends readonly unknown[], In extends "world" | "relation"> = [
  {
    [I in keyof Children]: unknown extends ChildRule<Children[I], In> ? never : I;
  }[number],
] extends [never]
  ? false
  : true;

/** `children` of `defineWorld` and `relation`: not empty, only nodes and relations; externals top level only. */
export type ChildrenRules<
  Children extends readonly unknown[],
  In extends "world" | "relation",
> = Children extends readonly []
  ? Forbidden<"children must not be empty">
  : HasChildErrors<Children, In> extends true
    ? { readonly [I in keyof Children]: ChildRule<Children[I], In> }
    : unknown;

// ─── Sync with MAX-5 ─────────────────────────────────────────────────────
// Fails to compile if the world format drops or duplicates a MAX-5 field.
// `parent` is not a node field: `relation` in the world file places nodes.

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _nodeFieldsInSync: Equals<
  keyof NodeDef | keyof NodeEdges | "schema" | "name" | "parent" | "edges",
  keyof NodeSpec | "implements" | "uses" | "delegate"
> = true;
const _callFieldsInSync: Equals<keyof WorldCallPort | "name" | "delegate", keyof CallPort> = true;
const _eventFieldsInSync: Equals<keyof WorldEventPort | "name" | "delegate", keyof EventPort> = true;
void _nodeFieldsInSync;
void _callFieldsInSync;
void _eventFieldsInSync;
