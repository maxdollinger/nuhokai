import { defineNode } from "../src/index.ts";

/**
 * This package, described in its own format (MAX-10 smoke test).
 * Top level for now; it moves under the Nuhokai node once the repo's own world exists.
 */
export const WorldFormat = defineNode({
  id: "01a16dd5-888a-77a4-9c88-e7d5bb03a016",
  purpose:
    "Lets a repo describe its world as TS files whose edges are typed references, so tsc catches dangling " +
    "references and the IDE navigates the graph. Defines the authoring format only: loading, rules, " +
    "checks and writing belong to the CLI.",
  status: "building",
  source: ["packages/world/src/**"],
  ports: {
    defineNode: {
      kind: "call",
      purpose: "Declare a node: static fields first, then .edges() with the lazy references",
      input: "MAX-5 fields with a uuidv7 id and ports by name; then parent, uses and delegates",
      output: "typed node handle exposing its own ports as properties",
    },
    inherited: {
      kind: "call",
      purpose: "Reference a port a node inherited from a contract it implements",
      input: "implementor and the contract's port",
      output: "inherited port reference",
    },
    tbdCall: {
      kind: "call",
      purpose: "Placeholder for a call port that is not designed yet",
      input: "description",
      output: "unresolved port reference",
    },
    tbdEvent: {
      kind: "call",
      purpose: "Placeholder for an event port that is not designed yet",
      input: "description",
      output: "unresolved port reference",
    },
  },
  requirements: [
    { id: "R1", text: "A reference to a missing port fails tsc." },
    { id: "R2", text: "A plain string in an edge position fails tsc." },
    { id: "R3", text: "An external or abstract node cannot be used as a parent (tsc)." },
    { id: "R4", text: "Placeholders are accepted wherever port references are, and are distinguishable at runtime." },
    { id: "R5", text: "Files of a world may import each other in cycles." },
    { id: "R6", text: "Reference cycles between nodes need no type annotations." },
    { id: "R7", text: "An implementor's inherited port is referenceable, only if it implements the contract (tsc)." },
    { id: "C1", kind: "constraint", text: "No runtime dependencies, no imports and no side effects at runtime." },
    { id: "C2", kind: "constraint", text: "Node fields are derived from the MAX-5 types, never redeclared." },
  ],
  testCases: [
    {
      text: "Typos and deleted ports in uses and delegate fail typecheck (example/type-errors.ts).",
      demonstrates: ["R1"],
    },
    { text: "Strings in uses, implements, parent and delegate fail typecheck.", demonstrates: ["R2"] },
    { text: "An external, abstract or not statically known parent fails typecheck.", demonstrates: ["R3"] },
    {
      text: "Two nodes using one placeholder; its $ref is 'unresolved', real ports have 'port'.",
      demonstrates: ["R4"],
    },
    { text: "Evaluating every lazy edge of the example world yields no undefined.", demonstrates: ["R5"] },
    { text: "The package's source files have no runtime imports.", demonstrates: ["C1"] },
    {
      text: "The example world's Orders <-> Stock and Shop <-> Orders cycles compile without annotations.",
      demonstrates: ["R5", "R6"],
    },
    {
      text: "inherited(Orders, AuditLog.history) compiles; with a node not implementing AuditLog it fails typecheck.",
      demonstrates: ["R7"],
    },
  ],
  decisions: [
    {
      decision: "A node's id is an authored uuidv7; its display name is the export name.",
      why: "Ids must survive renames and moves of nodes and files; the export name is already unique per file and is what references use.",
      rejected: [
        {
          option: "MAX-5 slug equal to the file name",
          why: "Breaks every stored reference when a node is renamed or moved.",
        },
        { option: "Ids derived from the file path", why: "Moving a file would change the node's identity." },
        { option: "An authored name field", why: "Would duplicate the export name and drift from it." },
      ],
    },
    {
      decision: "The child declares its parent as a lazy node reference; no parent means top level.",
      why: "Keeps a node's placement in its own file, and lets tsc reject external or abstract parents through literal-typed flags on the handle.",
      rejected: [
        {
          option: "Parent lists its children",
          why: "Every new child would edit the parent's file, and cycles between parent and child files would be the rule.",
        },
        {
          option: "Folder structure decides the parent",
          why: "Folders are a free convention; moving files must not change the model.",
        },
      ],
    },
    {
      decision:
        "A node is defined in two steps: defineNode(static fields) is generic and infers the handle's type; .edges(lazy references) is not generic and returns the handle.",
      why: "Lazy edges let modules import each other in cycles. Because the handle's type depends only on step one, TypeScript never has to infer a node's type through another node, so reference cycles need no annotations, and edge errors point at the offending element.",
      rejected: [
        {
          option: "One generic defineNode call holding the edges, one return-type annotation per reference cycle",
          why: "TypeScript cannot infer types through a cycle (TS7022); the rule is easy to forget and delegating parents always hit it.",
        },
        { option: "Loosely typed edges that need no annotation", why: "Strings and external parents would pass tsc." },
        {
          option: "The draft from defineNode usable as a node, .edges() optional",
          why: "The method would take a property name from the ports, and an exported draft and its finished node would be two handles for one node.",
        },
      ],
    },
    {
      decision:
        "Ports are a record keyed by name; handles expose own ports only, inherited ports are referenced with inherited(Node, Contract.port).",
      why: "A record makes Node.port resolve to its declaring key, so go-to-definition and find-references work. Inherited ports as handle properties would need the implements edges evaluated when the node is defined; inherited() is checked against the contracts in the handle's type instead.",
      rejected: [
        { option: "The MAX-5 port array", why: "Property access on a handle would not link back to the declaration." },
        {
          option: "Referencing the contract's port (AuditLog.history) for an implementor's port",
          why: "MAX-5 distinguishes depending on the contract from depending on an implementation.",
        },
      ],
    },
    {
      decision:
        "References are branded with type-only classes with a #private member; the loader resolves them by object identity.",
      why: "No string, look-alike literal or spread of a real reference ({ ...Stock.reserve, name: 'x' }) has the member, and nothing exists at runtime.",
      rejected: [
        {
          option: "unique symbol phantom brands",
          why: "Spreads copy symbol-keyed properties, so forged references passed tsc.",
        },
        {
          option: "Resolving references by id and name",
          why: "A forged object cast past the types would then resolve.",
        },
      ],
    },
    {
      decision:
        "The MAX-5 node types live in this package as plain type-only TypeScript; the TypeBox schemas and JSON reader/writer are gone.",
      why: "The TS files are the format, so nothing reads node JSON anymore, and the shipped .d.ts must be self-contained.",
      rejected: [
        {
          option: "Importing the types from @nuhokai/shared/spec",
          why: "That module also holds the TypeBox schemas, so the .d.ts could not resolve without node_modules.",
        },
      ],
    },
  ],
}).edges({});
