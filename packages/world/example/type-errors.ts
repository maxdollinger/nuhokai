/**
 * Compile-time acceptance tests (the format's type rules, its dome rules, plus
 * the strictness the format relies on). Never imported or run: `tsc -p .` (the package's `typecheck`) proves that each marked line
 * fails, because an unused `@ts-expect-error` is itself an error. Each
 * directive sits on the line of the offending element.
 */
import { defineWorld, inherited, type NodeDef, node, type PortsDef, tbd } from "../src/index.ts";
import { AuditLog, notifyCustomer, Orders, Postgres, Shop, Stock } from "./index.ts";

const base: Pick<NodeDef, "id" | "purpose" | "status" | "source"> = {
  id: "01a16dd2-bc47-74bf-84dd-c156e496d92b",
  purpose: "Type test",
  status: "planned",
  source: [],
};

const Cmd = node({
  ...base,
  id: "01a16dd2-bc47-74bf-84dd-c156e496d92dd",
  ports: { run: { kind: "call", purpose: "Run" }, stopped: { kind: "event", purpose: "Stopped" } },
}).edges({});

const Other = node({
  ...base,
  id: "01a16dd2-bc47-74bf-84dd-c156e496d92dc",
  ports: { run: { kind: "call", purpose: "Run" } },
}).edges({});

// ─── Criterion 2: dangling port references ───────────────────────────────

export const typoInPort = node(base).edges({
  // @ts-expect-error `reserv` is not a port of Stock
  uses: () => [Stock.reserv],
});

// A port that existed and was deleted: `Before` had `remove`, `After` no longer does.
const Before = node({
  ...base,
  ports: { add: { kind: "call", purpose: "Add" }, remove: { kind: "call", purpose: "Remove" } },
}).edges({});
const After = node({ ...base, ports: { add: { kind: "call", purpose: "Add" } } }).edges({});
export const usesKeptPort = node(base).edges({ uses: () => [Before.remove, After.add] });
export const usesDeletedPort = node(base).edges({
  // @ts-expect-error `remove` was deleted from After
  uses: () => [After.remove],
});

export const domeExposesDeletedPort = node({
  ...base,
  children: { after: After },
  ports: () => ({
    // @ts-expect-error `remove` was deleted from After
    remove: After.remove,
  }),
}).edges({});

// ─── Criterion 3: plain strings and forged references in edge positions ──

export const stringInUses = node(base).edges({
  // @ts-expect-error a string is not a PortRef
  uses: () => ["reserve"],
});

export const stringInImplements = node({
  ...base,
  // @ts-expect-error a string is not a NodeRef
  implements: () => ["audit-log"],
}).edges({});

export const forgedRef = node(base).edges({
  // @ts-expect-error look-alike objects lack the brand
  uses: () => [{ $ref: "port", kind: "call", node: Stock, name: "reserve" }],
});

export const spreadForgedPort = node(base).edges({
  // @ts-expect-error a spread drops the brand, so a renamed copy is not a port
  uses: () => [{ ...Stock.reserve, name: "x" }],
});

export const nodeInUses = node(base).edges({
  // @ts-expect-error uses lists ports, not nodes
  uses: () => [Stock],
});

export const edgesInStepOne = node({
  ...base,
  // @ts-expect-error references to other nodes go into .edges()
  uses: () => [Stock.reserve],
}).edges({});

export const parentListedInEdges = node(base).edges({
  // @ts-expect-error the hierarchy lives in children, not in .edges()
  parent: () => Shop,
});

export const delegateInEdges = node({ ...base, ports: { place: { kind: "call", purpose: "Place" } } }).edges({
  // @ts-expect-error delegate is gone: a dome port references a child port
  delegate: { place: () => Orders.place },
});

// ─── Domes: children ────────────────────────────────────────────────────

const Draft = node(base);

export const emptyChildren = node({
  ...base,
  // @ts-expect-error children must not be empty
  children: {},
}).edges({});

export const stringChild = node({
  ...base,
  children: {
    // @ts-expect-error a child is a node reference, not a string
    cmd: "cmd",
  },
}).edges({});

export const draftChild = node({
  ...base,
  children: {
    // @ts-expect-error a draft is not a node until .edges() is called
    cmd: Draft,
  },
}).edges({});

export const portChild = node({
  ...base,
  children: {
    // @ts-expect-error a child is a node, not a port
    cmd: Cmd.run,
  },
}).edges({});

export const forgedChild = node({
  ...base,
  children: {
    // @ts-expect-error a spread drops the brand, so Shop's flags cannot be put on Cmd
    cmd: { ...Cmd, $def: Other.$def },
  },
}).edges({});

export const externalChild = node({
  ...base,
  children: {
    // @ts-expect-error external nodes are top level only
    postgres: Postgres,
  },
}).edges({});

export const abstractChild = node({
  ...base,
  children: {
    // @ts-expect-error abstract nodes cannot have children, so they cannot be a child
    audit: AuditLog,
  },
}).edges({});

declare const unknownFlag: boolean;
const MaybeExternal = node({ ...base, external: unknownFlag }).edges({});
const MaybeAbstract = node({ ...base, abstract: unknownFlag }).edges({});
export const maybeExternalChild = node({
  ...base,
  children: {
    // @ts-expect-error MaybeExternal may be external
    maybe: MaybeExternal,
  },
}).edges({});
export const maybeAbstractChild = node({
  ...base,
  children: {
    // @ts-expect-error MaybeAbstract may be abstract
    maybe: MaybeAbstract,
  },
}).edges({});

// ─── Domes: flag rules ───────────────────────────────────────────────────

export const externalDome = node({
  ...base,
  external: true,
  // @ts-expect-error external nodes cannot have children: they are top level only
  children: { cmd: Cmd },
}).edges({});

export const abstractDome = node({
  ...base,
  abstract: true,
  // @ts-expect-error abstract nodes cannot have children
  children: { cmd: Cmd },
}).edges({});

export const maybeExternalDome = node({
  ...base,
  external: unknownFlag,
  // @ts-expect-error MaybeExternal may be external, so it cannot have children
  children: { cmd: Cmd },
}).edges({});

export const maybeAbstractDome = node({
  ...base,
  abstract: unknownFlag,
  // @ts-expect-error MaybeAbstract may be abstract, so it cannot have children
  children: { cmd: Cmd },
}).edges({});

export const domeUses = node({ ...base, children: { cmd: Cmd } }).edges({
  // @ts-expect-error a dome has no behavior of its own: put uses in one of its children
  uses: () => [Stock.reserve],
});

export const domeWithPortsRecord = node({
  ...base,
  children: { cmd: Cmd },
  // @ts-expect-error a dome's ports are a function that references child ports
  ports: { run: Cmd.run },
}).edges({});

export const leafWithPortsFunction = node({
  ...base,
  // @ts-expect-error a leaf's ports are a record, not a function
  ports: () => ({ run: Stock.reserve }),
}).edges({});

// ─── Domes: ports reference direct child ports ──────────────────────────

export const portOfNonChild = node({
  ...base,
  children: { cmd: Cmd },
  // @ts-expect-error Other is not one of this dome's direct children
  ports: () => ({
    run: Other.run,
  }),
}).edges({});

const Inner = node({
  ...base,
  id: "01a16dd2-bc47-74bf-84dd-c156e496d92de",
  children: { cmd: Cmd },
  ports: (c) => ({ run: c.cmd.ports.run }),
}).edges({});
export const grandchildPort = node({
  ...base,
  children: { inner: Inner },
  // @ts-expect-error Cmd is a grandchild, not a direct child
  ports: () => ({
    run: Cmd.run,
  }),
}).edges({});

export const placeholderAsDomePort = node({
  ...base,
  children: { stock: Stock },
  // @ts-expect-error a placeholder is not a child's port
  ports: () => ({
    notify: notifyCustomer,
  }),
}).edges({});

export const emptyDomePortName = node({
  ...base,
  children: { cmd: Cmd },
  // @ts-expect-error port names must not be empty
  ports: () => ({
    "": Cmd.run,
  }),
}).edges({});

export const reservedDomePortName = node({
  ...base,
  children: { cmd: Cmd },
  // @ts-expect-error `ports` is reserved for the handle's port namespace
  ports: () => ({
    ports: Cmd.run,
  }),
}).edges({});

const wideDomePorts: Record<string, typeof Cmd.run> = { run: Cmd.run };
export const wideDomePortRecord = node({
  ...base,
  children: { cmd: Cmd },
  // @ts-expect-error port names must be known statically
  ports: () => wideDomePorts,
}).edges({});

// Valid: a dome without public ports is still a container.
export const silentDome = node({ ...base, children: { cmd: Cmd } }).edges({});

// Valid: child ports under their own or a new name; nested domes compose.
const App = node({
  ...base,
  children: { cmd: Cmd },
  ports: (c) => ({ run: c.cmd.ports.run, stopped: c.cmd.ports.stopped }),
}).edges({});
export const composedDome = node({
  ...base,
  children: { app: App },
  ports: (c) => ({ run: c.app.ports.run }),
}).edges({});

// ─── Inherited ports ─────────────────────────────────────────────────────

export const usesInheritedPort = node(base).edges({ uses: () => [inherited(Orders, AuditLog.history)] });

export const domeExposesInheritedPort = node({
  ...base,
  children: { orders: Orders },
  ports: (c) => ({ history: inherited(c.orders, AuditLog.history) }),
}).edges({});

export const inheritedFromUnimplemented = node(base).edges({
  // @ts-expect-error Stock does not implement AuditLog
  uses: () => [inherited(Stock, AuditLog.history)],
});

export const inheritedOwnPort = node(base).edges({
  // @ts-expect-error Stock is not a contract that Orders implements
  uses: () => [inherited(Orders, Stock.reserve)],
});

// ─── Contracts: port names ───────────────────────────────────────────────

export const ownPortClashesWithInherited = node({
  ...base,
  ports: {
    // @ts-expect-error `history` is inherited from AuditLog
    history: { kind: "call", purpose: "Own history" },
  },
  implements: () => [AuditLog],
}).edges({});

const OtherAudit = node({
  ...base,
  abstract: true,
  ports: { history: { kind: "call", purpose: "Another history" } },
}).edges({});
export const contractsShareAPort = node({
  ...base,
  // @ts-expect-error AuditLog already declares `history`
  implements: () => [AuditLog, OtherAudit],
}).edges({});

export const contractListedTwice = node({
  ...base,
  // @ts-expect-error AuditLog is already listed
  implements: () => [AuditLog, AuditLog],
}).edges({});

// ─── Requirements ────────────────────────────────────────────────────────

export const duplicateRequirementId = node({
  ...base,
  requirements: [
    { id: "R1", text: "First." },
    // @ts-expect-error requirement ids are unique within the node
    { id: "R1", text: "Second." },
  ],
}).edges({});

export const demonstratesUnknownId = node({
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
export const wideRequirementId = node({
  ...base,
  requirements: [
    { id: requirementId, text: "First." },
    { id: "R1", text: "Second." },
  ],
}).edges({});

// Until the node spec decides otherwise, only own requirement ids: AuditLog's R1 does not count for its implementor.
export const demonstratesContractId = node({
  ...base,
  implements: () => [AuditLog],
  testCases: [
    // @ts-expect-error R1 is AuditLog's requirement, not this node's
    { text: "Lists every change.", demonstrates: ["R1"] },
  ],
}).edges({});

// ─── Port names ──────────────────────────────────────────────────────────

const widePorts: PortsDef = { add: { kind: "call", purpose: "Add" } };
export const widePortRecord = node({
  ...base,
  // @ts-expect-error port names must be known statically, or any `Node.typo` would compile
  ports: widePorts,
}).edges({});

export const reservedPortName = node({
  ...base,
  // @ts-expect-error `$`-names are reserved for handle properties
  ports: { $def: { kind: "call", purpose: "Clash" } },
}).edges({});

export const portsNamespaceName = node({
  ...base,
  // @ts-expect-error `ports` is reserved for the handle's port namespace
  ports: { ports: { kind: "call", purpose: "Clash" } },
}).edges({});

export const emptyPortName = node({
  ...base,
  // @ts-expect-error port names must not be empty
  ports: { "": { kind: "call", purpose: "Empty" } },
}).edges({});

export const protoPortName = node({
  ...base,
  // @ts-expect-error a literal `__proto__` key sets the prototype at runtime instead of declaring a port
  ports: { __proto__: { kind: "call", purpose: "Proto" } },
}).edges({});

// ─── Flag rules (node spec) ──────────────────────────────────────────────

export const abstractWithUses = node({ ...base, abstract: true }).edges({
  // @ts-expect-error abstract nodes have no uses edges
  uses: () => [Stock.reserve],
});

export const abstractImplements = node({
  ...base,
  abstract: true,
  // @ts-expect-error abstract nodes implement no other node
  implements: () => [AuditLog],
}).edges({});

export const externalTypeOnInternal = node({
  ...base,
  // @ts-expect-error externalType is for external nodes only
  externalType: "db",
}).edges({});

export const implementsConcrete = node({
  ...base,
  // @ts-expect-error only abstract nodes can be implemented
  implements: () => [Orders],
}).edges({});

// ─── Further strictness ──────────────────────────────────────────────────

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

// ─── Worlds ──────────────────────────────────────────────────────────────

export const emptyWorld = defineWorld({
  // @ts-expect-error children must not be empty
  children: [],
});

export const stringInWorld = defineWorld({
  children: [
    // @ts-expect-error a child is a node reference, not a string
    "shop",
  ],
});

export const relationInWorld = defineWorld({
  children: [
    // @ts-expect-error relation() is gone: a node lists its children itself
    { $ref: "relation", parent: Shop, children: [Orders] },
  ],
});

export const draftInWorld = defineWorld({
  children: [
    // @ts-expect-error a draft is not a node until .edges() is called
    Draft,
  ],
});

export const portInWorld = defineWorld({
  children: [
    // @ts-expect-error a child is a node, not a port
    Orders.place,
  ],
});

export const validWorld = defineWorld({ children: [Postgres, AuditLog, Shop] });
export const reusedWorld = defineWorld({ children: validWorld.children });
const mixed = [Postgres, composedDome];
export const mixedWorld = defineWorld({ children: mixed });
