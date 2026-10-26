import type { CallPort, EventPort, NodeId, NodeSpec, Port } from "./node-spec.ts";

export type { NodeId };

/**
 * Types of the world format (MAX-10, MAX-16): nodes as TS files whose edges are
 * typed references to other nodes, so `tsc` catches dangling references.
 *
 * Everything here is derived from the MAX-5 node spec (`nuhokai/node@1`);
 * only the fields the world format represents differently are replaced:
 * - `id` is any string, kept as a literal type on the handle; `name` is not
 *   authored (the loader takes the export name); `schema` is implied.
 * - `edges` become lazy typed references; a dome's ports are references to
 *   direct children's ports.
 * - `parent` is not a node field: a node lists its direct children itself, and
 *   `defineWorld` lists the top-level nodes (MAX-16).
 * - `ports` is a record keyed by port name instead of an array, so
 *   `Node.portName` resolves to the declaring key (go-to-definition, find references).
 *
 * A node with children is a dome: a pure container whose behavior is its
 * children. Its ports are references to direct children's ports, never fields
 * of its own. A node without children is a leaf: it declares its own ports.
 *
 * A node is defined in two steps: `node(static fields)` is generic and infers
 * the handle's type; `.edges(lazy references)` is not generic, so the handle's
 * type depends only on the contracts it implements and its direct children,
 * never on a node that could point back, and reference cycles need no
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

/**
 * Reference to a node; at runtime the handle returned by `.edges()`.
 * The type parameters are the node's static facts as literal types, so
 * children and `inherited` can restrict which nodes they accept: its flags,
 * its `id`, and the ids of the contracts it implements.
 */
export interface NodeRef<
  External extends boolean = boolean,
  Abstract extends boolean = boolean,
  Id extends NodeId = NodeId,
  Impl extends NodeId = never,
> extends NodeBrand {
  readonly [nodeFlags]: {
    readonly external: External;
    readonly abstract: Abstract;
    readonly id: Id;
    // A parameter, so a node implementing more contracts is still assignable.
    readonly implements: (contract: Impl) => void;
  };
  readonly $ref: "node";
  /** Both definition steps as stored, deep-frozen; edges stay lazy functions. */
  readonly $def: StoredNodeDef & NodeEdges;
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
 * not designed yet. Accepted in `uses`, but not in a dome's port mapping: a
 * dome exposes only a real port of a direct child. The unresolved brand and
 * `$ref: "unresolved"` tell it apart from a real port.
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
/** A port declared by a node: what a dome may expose from a direct child. */
export type DomePortRef<K extends PortKind = PortKind> = ResolvedPortRef<K> | InheritedPortRef<K>;
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

/** MAX-5 `CallPort` without `name` (the record key); `delegate` is implied by a dome's port mapping. */
export interface WorldCallPort extends Authored<Omit<CallPort, "name" | "delegate">> {}

/** MAX-5 `EventPort` without `name` (the record key); `delegate` is implied by a dome's port mapping. */
export interface WorldEventPort extends Authored<Omit<EventPort, "name" | "delegate">> {}

export type WorldPort = WorldCallPort | WorldEventPort;

/** A port as stored in `$def`: a dome port records the direct child port it exposes. */
export type StoredWorldPort = WorldPort & {
  readonly delegate?: { readonly to: NodeId; readonly port: string };
};
/** Stored ports, keyed by name. */
export type StoredPortsDef = { readonly [name: string]: StoredWorldPort };

/**
 * Authored ports, keyed by name. Names starting with `$` are reserved for the
 * handle's own properties (`$ref`, `$def`); `ports` is reserved for its port namespace.
 */
export type PortsDef = { readonly [name: string]: WorldPort } & { readonly [name: `$${string}`]: never };

/** Direct children keyed by the name a dome uses to reference them, e.g. `{ cmd: Cmd }`. */
export type ChildNodes = { readonly [name: string]: ParentRef };

/** What a dome's ports function returns: one direct child's port per own port name. */
export type DomePortsDef = { readonly [name: string]: DomePortRef };

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

/**
 * The fields every node authors. All fields not declared here are MAX-5
 * `NodeSpec` fields; `ports` and `children` are added by `NodeShape`.
 */
export interface NodeDef<
  External extends boolean = boolean,
  Abstract extends boolean = boolean,
  Id extends NodeId = NodeId,
  Contracts extends readonly ContractRef[] = readonly ContractRef[],
  R extends RequirementsDef = RequirementsDef,
  T extends TestCasesDef = TestCasesDef,
> extends Authored<Omit<NodeSpec, Replaced>> {
  readonly id: Id;
  /** Defaults to false. */
  readonly external?: External;
  /** Defaults to false. */
  readonly abstract?: Abstract;
  /**
   * MAX-5 `implements` edges: the abstract nodes whose contract this node
   * fulfils. Lazy like every edge, but part of step one because the handle's
   * type records the contracts (see `inherited`) and their ports are checked
   * against the own ports; contracts reference no other node in step one, so
   * this never forms a type cycle.
   */
  readonly implements?: Implements<Contracts>;
  /** MAX-5 `requirements`; a type parameter, so that tsc can check the ids. */
  readonly requirements?: R;
  /** MAX-5 `testCases`; a type parameter, so that tsc can check `demonstrates`. */
  readonly testCases?: T;
}

/**
 * The argument shape `node` infers from: a leaf has no children and a ports
 * record; a dome has a children record and a ports function. `C` is `undefined`
 * for a leaf, which keeps an empty `children: {}` recognisable as a dome.
 */
export interface NodeShape<
  C extends Record<string, unknown> | undefined = undefined,
  P extends Record<string, unknown> = Record<string, unknown>,
  External extends boolean = boolean,
  Abstract extends boolean = boolean,
  Id extends NodeId = NodeId,
  Contracts extends readonly ContractRef[] = readonly ContractRef[],
  R extends RequirementsDef = RequirementsDef,
  T extends TestCasesDef = TestCasesDef,
> extends NodeDef<External, Abstract, Id, Contracts, R, T> {
  readonly children?: C;
  readonly ports?: IsDome<C> extends true ? (children: NonNullable<C>) => P : P;
}

/** Step two of a node, the argument of `.edges()`: lazy references to other nodes. */
export interface NodeEdges {
  /**
   * MAX-5 `uses` edges: every port this leaf depends on. The loader groups them
   * by node and checks the scope against the world tree. Not in step one:
   * `uses` may point anywhere, also back, so it would form type cycles (TS7022).
   */
  readonly uses?: () => readonly PortRef[];
}

/**
 * A node definition as stored in `$def`: the authored fields with a dome's
 * ports function resolved to port definitions. Each dome port carries the
 * MAX-5 `delegate` to the direct child port it exposes.
 */
export interface StoredNodeDef extends Authored<Omit<NodeSpec, Replaced>> {
  readonly id: NodeId;
  readonly external?: boolean;
  readonly abstract?: boolean;
  readonly ports?: StoredPortsDef;
  readonly children?: ChildNodes;
  readonly implements?: () => readonly ContractRef[];
  readonly requirements?: RequirementsDef;
  readonly testCases?: TestCasesDef;
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
      ("__proto__" extends keyof P ? { readonly __proto__: Forbidden<"`__proto__` is not a port name"> } : unknown) &
      ("ports" extends keyof P
        ? { readonly ports: Forbidden<"`ports` is reserved for the handle's port namespace"> }
        : unknown);

/** Flag rules for the fields a node authors, independent of children. */
export type DefRules<External extends boolean, Abstract extends boolean> = (true extends External
  ? unknown
  : { readonly externalType?: Forbidden<"externalType is for external nodes only"> }) &
  (true extends Abstract ? { readonly implements?: Forbidden<"abstract nodes implement no other node"> } : unknown);

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

/** The contracts with their clash rules; a type argument of `NodeDef` in `node`. */
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

/** The requirements with the uniqueness rule; a type argument of `NodeDef` in `node`. */
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
 * `node`: only own requirement ids. Whether an implementor may demonstrate a
 * contract's requirement is open (MAX-5 is silent).
 */
export type CheckedTestCases<T extends TestCasesDef, R extends RequirementsDef> = T &
  NoInfer<
    [UnknownIds<DemonstratesOf<T[number]>, R[number]["id"]>] extends [never]
      ? unknown
      : TestCaseRules<T, R[number]["id"]>
  >;

/**
 * The step-one rules of a leaf not carried by the type arguments of
 * `NodeDef`, intersected with the argument of `node`.
 */
export type NodeRules<
  P extends PortsDef,
  External extends boolean,
  Abstract extends boolean,
  Contracts extends readonly ContractRef[],
> = {
  readonly ports?: PortRules<P> & NoInfer<InheritedPortRules<P, Contracts>>;
} & NoInfer<ContractRules<Contracts>> &
  DefRules<External, Abstract>;

// ─── Children ────────────────────────────────────────────────────────────

type FlagsOf<N> = N extends { readonly [nodeFlags]: infer Flags } ? Flags : never;
type ExternalOf<N> = FlagsOf<N> extends { readonly external: infer E } ? E : never;
type AbstractOf<N> = FlagsOf<N> extends { readonly abstract: infer A } ? A : never;

/** Why a child entry is not a node at all. */
type NotANode<V> = V extends string
  ? Forbidden<"a child is a node reference, not a string">
  : V extends { readonly $ref: "draft" }
    ? Forbidden<"a draft is not a node: call .edges(), also with {}">
    : V extends PortRef
      ? Forbidden<"a child is a node, not a port">
      : V extends { readonly $ref: "relation" }
        ? Forbidden<"relation() is gone: a node lists its children itself">
        : Forbidden<"a child is a node from node(...).edges(...)">;

/**
 * Why a node cannot be a child of a dome, as messages; `never` if it can.
 * Distributes, so each node of a union (an inferred mixed array) is judged
 * by its own flags. Externals are top level only; abstract nodes have no
 * children, so they cannot sit in a tree.
 */
type NodeChildProblems<C> = C extends unknown
  ?
      | ([ExternalOf<C>] extends [false]
          ? never
          : [ExternalOf<C>] extends [true]
            ? "external nodes are top level only"
            : "this node may be external (its flag is not a literal), so it cannot be a child")
      | ([AbstractOf<C>] extends [false]
          ? never
          : [AbstractOf<C>] extends [true]
            ? "abstract nodes cannot have children, so they cannot be a child"
            : "this node may be abstract (its flag is not a literal), so it cannot be a child")
  : never;

type NodeChildRule<C> = [C] extends [NodeRef]
  ? [NodeChildProblems<C>] extends [never]
    ? unknown
    : Forbidden<NodeChildProblems<C>>
  : NotANode<C>;

/** Whether any child of a dome breaks a rule. */
type HasNodeChildErrors<C extends Record<string, unknown>> = [
  { [K in keyof C]: unknown extends NodeChildRule<C[K]> ? never : K }[keyof C],
] extends [never]
  ? false
  : true;

/** `children` of a dome: not empty, only non-external, non-abstract nodes. */
export type ChildNodesRules<C extends Record<string, unknown>> = [keyof C] extends [never]
  ? Forbidden<"children must not be empty">
  : HasNodeChildErrors<C> extends true
    ? { readonly [K in keyof C]: NodeChildRule<C[K]> }
    : unknown;

/** The literal ids of a dome's direct children. */
type ChildIds<C> = { readonly [K in keyof C]: NodeIdOf<C[K]> }[keyof C];
/** The node id a port reference points at; `never` for an unresolved placeholder. */
type DomePortId<R> = R extends { readonly node: infer N } ? NodeIdOf<N> : never;
type WrongDomePorts<C, R> = {
  [K in keyof R]: [DomePortId<R[K]>] extends [never] ? K : [DomePortId<R[K]>] extends [ChildIds<C>] ? never : K;
}[keyof R];
type DomePortRules<C, R> = {
  readonly [K in keyof R]: [DomePortId<R[K]>] extends [never]
    ? Forbidden<"a dome exposes only a port of one of its direct children">
    : [DomePortId<R[K]>] extends [ChildIds<C>]
      ? unknown
      : Forbidden<"a dome exposes only a port of one of its direct children">;
};

/** The ports a dome exposes from its direct children, with the name and child rules. */
export type CheckedDomePorts<C extends Record<string, unknown>, R extends DomePortsDef> = R &
  NoInfer<PortRules<R> & ([WrongDomePorts<C, R>] extends [never] ? unknown : DomePortRules<C, R>)>;

/** A node with children cannot be external or abstract; the flags must be literal `false`. */
export type DomeRules<External extends boolean, Abstract extends boolean> = (true extends External
  ? { readonly children: Forbidden<"external nodes cannot have children: they are top level only"> }
  : [External] extends [false]
    ? unknown
    : {
        readonly children: Forbidden<"this node may be external (its flag is not a literal), so it cannot have children">;
      }) &
  (true extends Abstract
    ? { readonly children: Forbidden<"abstract nodes cannot have children"> }
    : [Abstract] extends [false]
      ? unknown
      : {
          readonly children: Forbidden<"this node may be abstract (its flag is not a literal), so it cannot have children">;
        });

/** Step two, with the rules that depend on step one. */
export type EdgesOf<Abstract extends boolean, Dome extends boolean> = NodeEdges &
  (true extends Abstract ? { readonly uses?: Forbidden<"abstract nodes have no uses edges"> } : unknown) &
  (true extends Dome
    ? { readonly uses?: Forbidden<"a dome has no behavior of its own: put uses in one of its children"> }
    : unknown);

// ─── Node shape ──────────────────────────────────────────────────────────

/** `undefined` means no children: a leaf. Any record of children makes a dome. */
export type IsDome<C> = [C] extends [undefined] ? false : true;

type LeafPortsRules<P, Contracts extends readonly ContractRef[]> = P extends PortsDef
  ? PortRules<P> & InheritedPortRules<P, Contracts>
  : { readonly [K in keyof P]: Forbidden<"a leaf's ports are MAX-5 port definitions"> };

type DomePortsRules<
  C extends Record<string, unknown>,
  P,
  Contracts extends readonly ContractRef[],
> = P extends DomePortsDef
  ? PortRules<P> &
      InheritedPortRules<P, Contracts> &
      ([WrongDomePorts<C, P>] extends [never] ? unknown : DomePortRules<C, P>)
  : { readonly [K in keyof P]: Forbidden<"a dome exposes only a port of one of its direct children"> };

/**
 * Everything `node` checks on one shape: a leaf needs own port definitions,
 * a dome needs non-external children and a ports function over their ports.
 */
export type NodeShapeRules<
  C extends Record<string, unknown> | undefined,
  P,
  External extends boolean,
  Abstract extends boolean,
  Contracts extends readonly ContractRef[],
> = (IsDome<C> extends true
  ? {
      readonly children: NonNullable<C> & NoInfer<ChildNodesRules<NonNullable<C>>>;
      readonly ports?: (children: NonNullable<C>) => P & NoInfer<DomePortsRules<NonNullable<C>, P, Contracts>>;
    } & DomeRules<External, Abstract>
  : {
      readonly ports?: P & NoInfer<LeafPortsRules<P, Contracts>>;
    } & DefRules<External, Abstract>) &
  NoInfer<ContractRules<Contracts>>;

/** The handle's port kinds: a leaf's own ports, or the child ports a dome exposes. */
export type PortsOfShape<C, P> =
  IsDome<C> extends true
    ? P extends DomePortsDef
      ? DomeKinds<P>
      : Record<never, never>
    : P extends PortsDef
      ? KindsOf<P>
      : Record<never, never>;

// ─── Handles ─────────────────────────────────────────────────────────────

/** A record of port names and kinds, enough to type a handle without its MAX-5 port definitions. */
export type PortKinds = { readonly [name: string]: PortKind };
/** The kinds of a leaf's authored ports. */
export type KindsOf<P extends PortsDef> = { readonly [K in keyof P]: P[K]["kind"] };
/** The kinds of the child ports a dome exposes. */
export type DomeKinds<R extends DomePortsDef> = { readonly [K in keyof R]: R[K]["kind"] };

/** What `node` returns. Not a node yet: call `.edges()`, also with `{}`. */
export interface NodeDraft<
  P extends PortKinds,
  External extends boolean,
  Abstract extends boolean,
  Id extends NodeId,
  Impl extends NodeId,
  Dome extends boolean,
> {
  readonly $ref: "draft";
  /** Adds the lazy edges and returns the node's handle. */
  edges(edges: EdgesOf<Abstract, Dome>): NodeHandle<P, External, Abstract, Id, Impl>;
}

/** A node reference with its ports as properties, plus the same references under `ports`. */
export type NodeHandle<
  P extends PortKinds,
  External extends boolean,
  Abstract extends boolean,
  Id extends NodeId,
  Impl extends NodeId,
> = NodeRef<External, Abstract, Id, Impl> & {
  readonly ports: { readonly [K in keyof P]: ResolvedPortRef<P[K], Id> };
} & { readonly [K in keyof P]: ResolvedPortRef<P[K], Id> };

// ─── World ───────────────────────────────────────────────────────────────
// The top level of the hierarchy. Every node lists its own children; the
// world file only lists the top-level nodes. Node files never import it, so
// it adds no import cycles.

/** An entry of the world's `children`: a top-level node. */
export type WorldChild = NodeRef;

/** The world, created by `defineWorld`: exactly the top-level nodes listed. */
export interface World extends WorldBrand {
  readonly $ref: "world";
  /** Top-level nodes. */
  readonly children: readonly WorldChild[];
}

/** The world's children: not empty, nodes only; externals are allowed here. */
export type WorldChildrenRules<Children extends readonly unknown[]> = Children extends readonly []
  ? Forbidden<"children must not be empty">
  : [
        {
          [I in keyof Children]: [Children[I]] extends [NodeRef] ? never : I;
        }[number],
      ] extends [never]
    ? unknown
    : {
        readonly [I in keyof Children]: [Children[I]] extends [NodeRef] ? unknown : NotANode<Children[I]>;
      };

// ─── Sync with MAX-5 ─────────────────────────────────────────────────────
// Fails to compile if the world format drops or duplicates a MAX-5 field.
// `parent` is not a node field: a node lists its children and `defineWorld`
// lists the top-level nodes.

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type LeafKeys = keyof NodeShape<
  undefined,
  PortsDef,
  boolean,
  boolean,
  NodeId,
  readonly ContractRef[],
  RequirementsDef,
  TestCasesDef
>;
type DomeKeys = keyof NodeShape<
  Record<string, unknown>,
  DomePortsDef,
  boolean,
  boolean,
  NodeId,
  readonly ContractRef[],
  RequirementsDef,
  TestCasesDef
>;
const _nodeFieldsInSync: Equals<
  LeafKeys | DomeKeys | keyof NodeEdges | "schema" | "name" | "parent" | "edges",
  keyof NodeSpec | "implements" | "uses" | "children"
> = true;
const _callFieldsInSync: Equals<keyof WorldCallPort | "name" | "delegate", keyof CallPort> = true;
const _eventFieldsInSync: Equals<keyof WorldEventPort | "name" | "delegate", keyof EventPort> = true;
void _nodeFieldsInSync;
void _callFieldsInSync;
void _eventFieldsInSync;
