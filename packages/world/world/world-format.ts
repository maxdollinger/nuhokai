import { defineNode } from "../src/index.ts";

/**
 * This package, described in its own format (MAX-10 smoke test).
 * Top level in `world/index.ts` for now; it moves under the Nuhokai node once the repo's own world exists.
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
      input: "MAX-5 fields with a uuidv7 id, ports by name, implements and delegates; then uses",
      output: "typed node handle exposing its own ports as properties",
    },
    defineWorld: {
      kind: "call",
      purpose: "Declare the world: every node, placed in one tree; the loader's only entry point",
      input: "top-level nodes and relations",
      output: "frozen world object",
    },
    relation: {
      kind: "call",
      purpose: "Place nodes under a parent, as a subtree that can live in its own file",
      input: "parent node and its direct children (nodes or relations)",
      output: "frozen relation object",
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
    {
      id: "R3",
      text: "In relation(), an external, abstract or not statically known node cannot be the parent, and an external node cannot be a child (tsc).",
    },
    { id: "R4", text: "Placeholders are accepted wherever port references are, and are distinguishable at runtime." },
    { id: "R5", text: "Files of a world may import each other in cycles." },
    { id: "R6", text: "Reference cycles between nodes need no type annotations." },
    { id: "R7", text: "An implementor's inherited port is referenceable, only if it implements the contract (tsc)." },
    {
      id: "R8",
      text: "The hierarchy is readable in one place: the world file lists every node, nested with relation().",
    },
    {
      id: "R9",
      text: "A rule that tsc can pin on the offending element fails there with a readable Forbidden message; global rules are the loader's.",
    },
    { id: "C1", kind: "constraint", text: "No runtime dependencies, no imports and no side effects at runtime." },
    { id: "C2", kind: "constraint", text: "Node fields are derived from the MAX-5 types, never redeclared." },
  ],
  testCases: [
    {
      text: "Typos and deleted ports in uses and delegate fail typecheck (example/type-errors.ts).",
      demonstrates: ["R1"],
    },
    {
      text: "Strings in uses, implements, relation parents and children, and delegate fail typecheck.",
      demonstrates: ["R2"],
    },
    { text: "An external, abstract or not statically known relation parent fails typecheck.", demonstrates: ["R3"] },
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
    {
      text: "example.test.ts walks example/world.ts: every exported node is listed once, under its parent.",
      demonstrates: ["R8"],
    },
    {
      text: "An external child, a delegate target that is not a child, and empty children fail typecheck in relation().",
      demonstrates: ["R3", "R9"],
    },
    {
      text: "Port clashes with inherited or other contracts' ports, duplicate requirement ids, unknown demonstrates ids, invalid uuidv7 ids and blank tbd descriptions fail typecheck on the offending element (type-errors.ts).",
      demonstrates: ["R9"],
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
    {
      decision:
        "Overrides 'the child declares its parent': the hierarchy is defined in one world file, world/index.ts, whose default export defineWorld({ children }) lists every node; nesting uses explicit relation({ parent, children }) objects, and node files never import the world file. delegate moves into step one, so relation() checks that delegate targets are direct children; .edges() keeps only uses.",
      why: "The hierarchy was scattered across all node files and only visible to a loader; Nuhokai gives software structure, so the map of islands and domes must be readable in one place. Delegation only points down, so recording its targets in the handle's type forms no type cycle; uses may point anywhere and stays in step two (TS7022). Typecheck of the example world (tsc 7.0.2, --extendedDiagnostics, median of 8 runs): before 3,590 types, 5,077 instantiations, check 0.012s; after 8,449 types, 20,570 instantiations, check 0.035s. A synthetic 200-node world: before 0.15s check, after 0.6s.",
      rejected: [
        {
          option: "Tuples, children: [Postgres, [Shop, [Orders, Stock]]]",
          why: "Unreadable: a parent is only told apart from its first child by position, and nested brackets hide the structure the file exists to show.",
        },
        {
          option: "Keeping parent in .edges()",
          why: "The hierarchy stays scattered across node files, and tsc cannot check delegate targets against children.",
        },
        {
          option: "Checking uses scope in tsc",
          why: "Putting uses into the handle's type brings back TS7022 cycles; the loader checks scope against the world tree.",
        },
      ],
    },
    {
      decision:
        "A rule goes into tsc only if the error lands on the offending element with a readable Forbidden message; global rules (duplicate ids, orphans, uses scope, unique export names) go to the loader, which re-checks every tsc rule because a cast bypasses the types.",
      why: "nuhokai check will run tsc and then the loader and print one list, so each message must point at its culprit; an error tsc could only put on defineWorld helps no one.",
      rejected: [
        {
          option: "Every rule in tsc",
          why: "Global rules would point at defineWorld, and uses scope would need uses in the types (TS7022).",
        },
        {
          option: "Rules as tuples intersected with the authored arrays, also when satisfied",
          why: "TypeScript then compares the arrays method by method: a 200-node world took 2.2s instead of 0.6s to check.",
        },
      ],
    },
  ],
}).edges({});
