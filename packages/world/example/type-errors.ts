/**
 * Compile-time acceptance tests (MAX-10 criteria 2-4, plus the strictness the
 * format relies on). Never imported or run: `tsc -p .` (the package's
 * `typecheck`) proves that each marked line fails, because an unused
 * `@ts-expect-error` is itself an error. Each directive sits on the line of
 * the offending element.
 */
import { defineNode, inherited, type NodeDef, type PortsDef, tbd } from "../src/index.ts";
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
}).edges({
  // @ts-expect-error `remove` was deleted from After
  delegate: { remove: () => After.remove },
});

export const delegateFromUnknownPort = defineNode(base).edges({
  // @ts-expect-error delegate keys are the node's own port names
  delegate: { place: () => Orders.place },
});

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

export const stringAsParent = defineNode(base).edges({
  // @ts-expect-error a string is not a NodeRef
  parent: () => "shop",
});

export const stringAsDelegate = defineNode({ ...base, ports: { place: { kind: "call", purpose: "Place" } } }).edges({
  // @ts-expect-error a string is not a PortRef
  delegate: { place: () => "orders.place" },
});

export const forgedRef = defineNode(base).edges({
  // @ts-expect-error look-alike objects lack the brand
  uses: () => [{ $ref: "port", kind: "call", node: Stock, name: "reserve" }],
});

export const spreadForgedPort = defineNode(base).edges({
  // @ts-expect-error a spread drops the brand, so a renamed copy is not a port
  uses: () => [{ ...Stock.reserve, name: "x" }],
});

export const spreadForgedParent = defineNode(base).edges({
  // @ts-expect-error a spread drops the brand, so Shop's flags cannot be put on Postgres
  parent: () => ({ ...Shop, $def: Postgres.$def }),
});

export const nodeInUses = defineNode(base).edges({
  // @ts-expect-error uses lists ports, not nodes
  uses: () => [Stock],
});

export const portAsParent = defineNode(base).edges({
  // @ts-expect-error a parent is a node, not a port
  parent: () => Stock.reserve,
});

const Draft = defineNode(base);
export const draftAsParent = defineNode(base).edges({
  // @ts-expect-error a draft is not a node until .edges() is called
  parent: () => Draft,
});

export const edgesInStepOne = defineNode({
  ...base,
  // @ts-expect-error references to other nodes go into .edges()
  uses: () => [Stock.reserve],
}).edges({});

// ─── Criterion 4: external or abstract parent ────────────────────────────

export const externalParent = defineNode(base).edges({
  // @ts-expect-error Postgres is external
  parent: () => Postgres,
});

export const abstractParent = defineNode(base).edges({
  // @ts-expect-error AuditLog is abstract
  parent: () => AuditLog,
});

// Only a literal `false` qualifies: a node whose flags are not known statically cannot be a parent.
declare const unknownFlag: boolean;
const Unknown = defineNode({ ...base, external: unknownFlag }).edges({});
export const unknownParent = defineNode(base).edges({
  // @ts-expect-error Unknown may be external
  parent: () => Unknown,
});

export const regularParent = defineNode(base).edges({ parent: () => Shop });

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
}).edges({
  // @ts-expect-error AuditLog.history is a call port
  delegate: { changed: () => inherited(Orders, AuditLog.history) },
});

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

export const externalWithParent = defineNode({ ...base, external: true }).edges({
  // @ts-expect-error external nodes have no parent
  parent: () => Shop,
});

export const abstractWithUses = defineNode({ ...base, abstract: true }).edges({
  // @ts-expect-error abstract nodes have no uses edges
  uses: () => [Stock.reserve],
});

export const abstractDelegates = defineNode({
  ...base,
  abstract: true,
  ports: { p: { kind: "call", purpose: "P" } },
}).edges({
  // @ts-expect-error abstract nodes do not delegate
  delegate: { p: () => Orders.place },
});

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
}).edges({
  // @ts-expect-error a delegated port takes its shapes from the child port
  delegate: { place: () => Orders.place },
});

// ─── Further strictness ──────────────────────────────────────────────────

export const implementsConcrete = defineNode({
  ...base,
  // @ts-expect-error only abstract nodes can be implemented
  implements: () => [Orders],
}).edges({});

export const delegateKindMismatch = defineNode({ ...base, ports: { place: { kind: "call", purpose: "Place" } } }).edges(
  {
    // @ts-expect-error a call port cannot delegate to an event port
    delegate: { place: () => Orders.cancelled },
  },
);

// @ts-expect-error a tbd needs a description
export const tbdWithoutDescription = tbd.call({});

// @ts-expect-error a tbd description must not be empty
export const tbdEmptyDescription = tbd.event({ description: "" });

export const tbdAsDelegate = defineNode({ ...base, ports: { notify: { kind: "call", purpose: "Notify" } } }).edges({
  delegate: { notify: () => notifyCustomer },
});

export const tbdKindMismatch = defineNode({ ...base, ports: { changed: { kind: "event", purpose: "Changed" } } }).edges(
  {
    // @ts-expect-error notifyCustomer is a call placeholder
    delegate: { changed: () => notifyCustomer },
  },
);

export const slugId = defineNode({
  ...base,
  // @ts-expect-error ids are uuidv7, not MAX-5 slugs
  id: "orders",
}).edges({});

export const authoredName = defineNode({
  ...base,
  // @ts-expect-error the name is the export name, not authored
  name: "Orders",
}).edges({});

export const unknownField = defineNode({
  ...base,
  // @ts-expect-error definitions are strict like MAX-5
  owner: "team-a",
}).edges({});

// `as const` fragments are accepted: authoring types are readonly throughout.
const shared = { source: ["src/shop/**"], requirements: [{ id: "R1", text: "Readonly works." }] } as const;
export const readonlyFragment = defineNode({ ...base, ...shared }).edges({});
