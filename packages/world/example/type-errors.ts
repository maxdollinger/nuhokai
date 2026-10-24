/**
 * Compile-time acceptance tests (MAX-10 criteria 2-4, the MAX-12 tsc rules,
 * plus the strictness the format relies on). Never imported or run: `tsc -p .`
 * (the package's `typecheck`) proves that each marked line fails, because an
 * unused `@ts-expect-error` is itself an error. Each directive sits on the
 * line of the offending element.
 */
import { defineNode, defineWorld, inherited, type NodeDef, type PortsDef, relation, tbd } from "../src/index.ts";
import { AuditLog, notifyCustomer, Orders, Postgres, Shop, Stock } from "./index.ts";

const base: Pick<NodeDef, "id" | "purpose" | "status" | "source"> = {
  id: "01a16dd2-bc47-74bf-84dd-c156e496d92b",
  purpose: "Type test",
  status: "planned",
  source: [],
};

// ─── Criterion 2: dangling port references ───────────────────────────────

export const typoInPort = defineNode(base).edges({
  // @ts-expect-error `reserv` is not a port of Stock
  uses: () => [Stock.reserv],
});

// A port that existed and was deleted: `Before` had `remove`, `After` no longer does.
const Before = defineNode({
  ...base,
  ports: { add: { kind: "call", purpose: "Add" }, remove: { kind: "call", purpose: "Remove" } },
}).edges({});
const After = defineNode({ ...base, ports: { add: { kind: "call", purpose: "Add" } } }).edges({});
export const usesKeptPort = defineNode(base).edges({ uses: () => [Before.remove, After.add] });
export const usesDeletedPort = defineNode(base).edges({
  // @ts-expect-error `remove` was deleted from After
  uses: () => [After.remove],
});

export const delegateToDeletedPort = defineNode({
  ...base,
  ports: { remove: { kind: "call", purpose: "Remove" } },
  // @ts-expect-error `remove` was deleted from After
  delegate: { remove: () => After.remove },
}).edges({});

export const delegateWithoutPorts = defineNode({
  ...base,
  // @ts-expect-error a node without ports has nothing to delegate
  delegate: { place: () => Orders.place },
}).edges({});

export const delegateInheritedPort = defineNode({
  ...base,
  implements: () => [AuditLog],
  // @ts-expect-error `history` is inherited; in MAX-5 only a port the node declares itself has a delegate
  delegate: { history: () => Orders.place },
}).edges({});

export const delegateFromUnknownPort = defineNode({
  ...base,
  ports: { cancel: { kind: "call", purpose: "Cancel" } },
  delegate: {
    // @ts-expect-error delegate keys are the node's own port names
    place: () => Orders.place,
  },
}).edges({});

// ─── Criterion 3: plain strings and forged references in edge positions ──

export const stringInUses = defineNode(base).edges({
  // @ts-expect-error a string is not a PortRef
  uses: () => ["reserve"],
});

export const stringInImplements = defineNode({
  ...base,
  // @ts-expect-error a string is not a NodeRef
  implements: () => ["audit-log"],
}).edges({});

export const stringAsDelegate = defineNode({
  ...base,
  ports: { place: { kind: "call", purpose: "Place" } },
  // @ts-expect-error a string is not a PortRef
  delegate: { place: () => "orders.place" },
}).edges({});

export const forgedRef = defineNode(base).edges({
  // @ts-expect-error look-alike objects lack the brand
  uses: () => [{ $ref: "port", kind: "call", node: Stock, name: "reserve" }],
});

export const spreadForgedPort = defineNode(base).edges({
  // @ts-expect-error a spread drops the brand, so a renamed copy is not a port
  uses: () => [{ ...Stock.reserve, name: "x" }],
});

export const nodeInUses = defineNode(base).edges({
  // @ts-expect-error uses lists ports, not nodes
  uses: () => [Stock],
});

export const edgesInStepOne = defineNode({
  ...base,
  // @ts-expect-error references to other nodes go into .edges()
  uses: () => [Stock.reserve],
}).edges({});

export const parentListedInEdges = defineNode(base).edges({
  // @ts-expect-error the hierarchy lives in the world file, not in .edges()
  parent: () => Shop,
});

export const delegateInEdges = defineNode({ ...base, ports: { place: { kind: "call", purpose: "Place" } } }).edges({
  // @ts-expect-error delegates go into step one, so the handle's type records the targets
  delegate: { place: () => Orders.place },
});

// ─── Criterion 4: external or abstract parent (relation) ─────────────────

export const externalParent = relation({
  // @ts-expect-error external nodes cannot be parents: they are top level only
  parent: Postgres,
  children: [Stock],
});

export const abstractParent = relation({
  // @ts-expect-error abstract nodes cannot be parents
  parent: AuditLog,
  children: [Stock],
});

// Only a literal `false` qualifies: a node whose flags are not known statically cannot be a parent.
declare const unknownFlag: boolean;
const MaybeExternal = defineNode({ ...base, external: unknownFlag }).edges({});
const MaybeAbstract = defineNode({ ...base, abstract: unknownFlag }).edges({});
export const maybeExternalParent = relation({
  // @ts-expect-error MaybeExternal may be external
  parent: MaybeExternal,
  children: [Stock],
});
export const maybeAbstractParent = relation({
  // @ts-expect-error MaybeAbstract may be abstract
  parent: MaybeAbstract,
  children: [Stock],
});

export const regularParent = relation({ parent: Shop, children: [Orders, Stock] });

// ─── Relations: strings, drafts, ports and forgeries ─────────────────────

const Draft = defineNode(base);

export const stringAsParent = relation({
  // @ts-expect-error a parent is a node reference, not a string
  parent: "shop",
  children: [Stock],
});

export const draftAsParent = relation({
  // @ts-expect-error a draft is not a node until .edges() is called
  parent: Draft,
  children: [Stock],
});

export const portAsParent = relation({
  // @ts-expect-error a parent is a node, not a port
  parent: Stock.reserve,
  children: [Orders],
});

export const spreadForgedParent = relation({
  // @ts-expect-error a spread drops the brand, so Shop's flags cannot be put on Postgres
  parent: { ...Shop, $def: Postgres.$def },
  children: [Orders],
});

export const emptyChildren = relation({
  parent: Stock,
  // @ts-expect-error children must not be empty
  children: [],
});

export const stringChild = relation({
  parent: Stock,
  children: [
    // @ts-expect-error a child is a node reference, not a string
    "orders",
  ],
});

export const draftChild = relation({
  parent: Stock,
  children: [
    // @ts-expect-error a draft is not a node until .edges() is called
    Draft,
  ],
});

export const portChild = relation({
  parent: Stock,
  children: [
    // @ts-expect-error a child is a node, not a port
    Orders.place,
  ],
});

export const forgedRelationChild = defineWorld({
  children: [
    // @ts-expect-error a look-alike relation lacks the brand
    { $ref: "relation", parent: Shop, children: [Orders] },
  ],
});

// ─── Relations: externals and delegates ──────────────────────────────────

export const externalChild = relation({
  parent: Stock,
  children: [
    // @ts-expect-error external nodes are top level only
    Postgres,
  ],
});

export const maybeExternalChild = relation({
  parent: Stock,
  children: [
    // @ts-expect-error MaybeExternal may be external
    MaybeExternal,
  ],
});

export const delegateTargetNotAChild = relation({
  // @ts-expect-error Shop delegates placeOrder and orderHistory to Orders, which is not listed
  parent: Shop,
  children: [Stock],
});

export const delegatorWithoutRelation = defineWorld({
  children: [
    Postgres,
    // @ts-expect-error Shop delegates to its children, so it must be a relation's parent
    Shop,
  ],
});

export const nestedDelegatorWithoutRelation = relation({
  parent: Stock,
  children: [
    // @ts-expect-error Shop delegates to its children, so it must be a relation's parent
    Shop,
  ],
});

export const emptyWorld = defineWorld({
  // @ts-expect-error children must not be empty
  children: [],
});

// A nested relation counts as a direct child through its parent, and subtrees compose.
const Outer = defineNode({
  ...base,
  ports: { place: { kind: "call", purpose: "Place" } },
  delegate: { place: () => Shop.placeOrder },
}).edges({});
export const shopSubtree = relation({ parent: Shop, children: [Orders, Stock] });
export const composedWorld = defineWorld({
  children: [Postgres, AuditLog, relation({ parent: Outer, children: [shopSubtree] })],
});

// Children typed as `WorldChild` unions compose too: spreads, inferred mixed arrays, another world's children.
export const spreadChildren = defineWorld({ children: [Postgres, AuditLog, ...composedWorld.children] });
const mixedChildren = [AuditLog, shopSubtree];
export const mixedRelation = relation({ parent: Outer, children: mixedChildren });
export const reusedWorld = defineWorld({ children: composedWorld.children });

export const widenedChildren = relation({
  parent: Shop,
  // @ts-expect-error a widened WorldChild may be external, so it can only be top level
  children: shopSubtree.children,
});

// Each node of an inferred mixed array is judged by its own flags.
const withExternal = [Postgres, Orders];
export const mixedWithExternal = relation({
  parent: Stock,
  // @ts-expect-error Postgres is external
  children: withExternal,
});
const withDelegator = [Stock, Shop];
export const mixedWithDelegator = relation({
  parent: Outer,
  // @ts-expect-error Shop delegates to its children, so it must be a relation's parent
  children: withDelegator,
});

// ─── Inherited ports ─────────────────────────────────────────────────────

export const usesInheritedPort = defineNode(base).edges({ uses: () => [inherited(Orders, AuditLog.history)] });

export const inheritedFromUnimplemented = defineNode(base).edges({
  // @ts-expect-error Stock does not implement AuditLog
  uses: () => [inherited(Stock, AuditLog.history)],
});

export const inheritedOwnPort = defineNode(base).edges({
  // @ts-expect-error Stock is not a contract that Orders implements
  uses: () => [inherited(Orders, Stock.reserve)],
});

export const inheritedKindMismatch = defineNode({
  ...base,
  ports: { changed: { kind: "event", purpose: "Changed" } },
  // @ts-expect-error AuditLog.history is a call port
  delegate: { changed: () => inherited(Orders, AuditLog.history) },
}).edges({});

// ─── Contracts: port names ───────────────────────────────────────────────

export const ownPortClashesWithInherited = defineNode({
  ...base,
  ports: {
    // @ts-expect-error `history` is inherited from AuditLog
    history: { kind: "call", purpose: "Own history" },
  },
  implements: () => [AuditLog],
}).edges({});

const OtherAudit = defineNode({
  ...base,
  abstract: true,
  ports: { history: { kind: "call", purpose: "Another history" } },
}).edges({});
export const contractsShareAPort = defineNode({
  ...base,
  implements: () => [
    AuditLog,
    // @ts-expect-error AuditLog already declares `history`
    OtherAudit,
  ],
}).edges({});

export const contractListedTwice = defineNode({
  ...base,
  implements: () => [
    AuditLog,
    // @ts-expect-error AuditLog is already listed
    AuditLog,
  ],
}).edges({});

// ─── Requirements ────────────────────────────────────────────────────────

export const duplicateRequirementId = defineNode({
  ...base,
  requirements: [
    { id: "R1", text: "First." },
    // @ts-expect-error requirement ids are unique within the node
    { id: "R1", text: "Second." },
  ],
}).edges({});

export const demonstratesUnknownId = defineNode({
  ...base,
  requirements: [{ id: "R1", text: "Only one." }],
  testCases: [
    { text: "Demonstrates R1.", demonstrates: ["R1"] },
    // @ts-expect-error there is no R2
    { text: "Demonstrates R2.", demonstrates: ["R2"] },
  ],
}).edges({});

// A non-literal id is left to the loader, and does not make a literal one a duplicate.
declare const requirementId: string;
export const wideRequirementId = defineNode({
  ...base,
  requirements: [
    { id: requirementId, text: "First." },
    { id: "R1", text: "Second." },
  ],
}).edges({});

// Until MAX-5 decides otherwise, only own requirement ids: AuditLog's R1 does not count for its implementor.
export const demonstratesContractId = defineNode({
  ...base,
  implements: () => [AuditLog],
  testCases: [
    // @ts-expect-error R1 is AuditLog's requirement, not this node's
    { text: "Lists every change.", demonstrates: ["R1"] },
  ],
}).edges({});

// ─── Port names ──────────────────────────────────────────────────────────

const widePorts: PortsDef = { add: { kind: "call", purpose: "Add" } };
export const widePortRecord = defineNode({
  ...base,
  // @ts-expect-error port names must be known statically, or any `Node.typo` would compile
  ports: widePorts,
}).edges({});

export const reservedPortName = defineNode({
  ...base,
  // @ts-expect-error `$`-names are reserved for handle properties
  ports: { $def: { kind: "call", purpose: "Clash" } },
}).edges({});

export const emptyPortName = defineNode({
  ...base,
  // @ts-expect-error port names must not be empty
  ports: { "": { kind: "call", purpose: "Empty" } },
}).edges({});

export const protoPortName = defineNode({
  ...base,
  // @ts-expect-error a literal `__proto__` key sets the prototype at runtime instead of declaring a port
  ports: { __proto__: { kind: "call", purpose: "Proto" } },
}).edges({});

// ─── Flag rules (MAX-5) ──────────────────────────────────────────────────

export const abstractWithUses = defineNode({ ...base, abstract: true }).edges({
  // @ts-expect-error abstract nodes have no uses edges
  uses: () => [Stock.reserve],
});

export const abstractDelegates = defineNode({
  ...base,
  abstract: true,
  ports: { p: { kind: "call", purpose: "P" } },
  // @ts-expect-error abstract nodes do not delegate
  delegate: { p: () => Orders.place },
}).edges({});

export const abstractImplements = defineNode({
  ...base,
  abstract: true,
  // @ts-expect-error abstract nodes implement no other node
  implements: () => [AuditLog],
}).edges({});

export const externalTypeOnInternal = defineNode({
  ...base,
  // @ts-expect-error externalType is for external nodes only
  externalType: "db",
}).edges({});

export const delegatedPortWithShapes = defineNode({
  ...base,
  ports: { place: { kind: "call", purpose: "Place", input: "cart" } },
  // @ts-expect-error a delegated port takes its shapes from the child port
  delegate: { place: () => Orders.place },
}).edges({});

export const externalDelegates = defineNode({
  ...base,
  external: true,
  ports: { p: { kind: "call", purpose: "P" } },
  // @ts-expect-error external nodes have no children to delegate to
  delegate: { p: () => Orders.place },
}).edges({});

// ─── Further strictness ──────────────────────────────────────────────────

export const implementsConcrete = defineNode({
  ...base,
  // @ts-expect-error only abstract nodes can be implemented
  implements: () => [Orders],
}).edges({});

export const delegateKindMismatch = defineNode({
  ...base,
  ports: { place: { kind: "call", purpose: "Place" } },
  // @ts-expect-error a call port cannot delegate to an event port
  delegate: { place: () => Orders.cancelled },
}).edges({});

// @ts-expect-error a tbd needs a description
export const tbdWithoutDescription = tbd.call({});

// @ts-expect-error a tbd description must not be empty
export const tbdEmptyDescription = tbd.event({ description: "" });

// @ts-expect-error a tbd description must not be whitespace only
export const tbdBlankDescription = tbd.call({ description: " \n\t " });

// @ts-expect-error vertical tab and form feed are whitespace too
export const tbdControlWhitespace = tbd.call({ description: "\v\f" });

// @ts-expect-error every character String.prototype.trim() removes counts, e.g. no-break space and BOM
export const tbdUnicodeWhitespace = tbd.event({ description: "\u00a0\ufeff\u3000" });

// A node delegating only to placeholders has no children yet, so it may stand alone.
export const tbdAsDelegate = defineNode({
  ...base,
  ports: { notify: { kind: "call", purpose: "Notify" } },
  delegate: { notify: () => notifyCustomer },
}).edges({});
export const tbdDelegatorAlone = defineWorld({ children: [tbdAsDelegate] });

export const tbdKindMismatch = defineNode({
  ...base,
  ports: { changed: { kind: "event", purpose: "Changed" } },
  // @ts-expect-error notifyCustomer is a call placeholder
  delegate: { changed: () => notifyCustomer },
}).edges({});
