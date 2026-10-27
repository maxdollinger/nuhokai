import { node } from "../src/index.ts";

/**
 * This package, described in its own format (a smoke test).
 * Top level in `nuhokai/index.ts` for now; it moves under the Nuhokai node once the repo's own world exists.
 */
export const WorldFormat = node({
  id: "01a16dd5-888a-77a4-9c88-e7d5bb03a016",
  purpose:
    "A repo's world as TS files with typed-reference edges: tsc catches dangling references, the IDE navigates the " +
    "graph. Format only; loading, rules, checks and writing are the CLI's.",
  status: "building",
  source: ["packages/world/src/**"],
  ports: {
    node: {
      kind: "call",
      purpose: "Declare a leaf or dome: children in step one, uses in .edges()",
      input: "node-spec fields; a leaf's ports by name, or a dome's children and port references",
      output: "typed handle exposing own ports",
    },
    defineWorld: {
      kind: "call",
      purpose: "Declare the world: its id and every node in one tree; the loader's only entry point",
      input: "world id, top-level nodes",
      output: "frozen world object with the id",
    },
    inherited: {
      kind: "call",
      purpose: "Reference a port inherited from an implemented contract",
      input: "implementor, contract's port",
      output: "inherited port reference",
    },
    tbdCall: {
      kind: "call",
      purpose: "Placeholder for a call port not designed yet",
      input: "description",
      output: "unresolved port reference",
    },
    tbdEvent: {
      kind: "call",
      purpose: "Placeholder for an event port not designed yet",
      input: "description",
      output: "unresolved port reference",
    },
  },
  requirements: [
    { id: "R1", text: "A reference to a missing port fails tsc." },
    { id: "R2", text: "A plain string in an edge position fails tsc." },
    {
      id: "R3",
      text: "A dome that is external or abstract, or exposes a non-child's port, fails tsc.",
    },
    { id: "R4", text: "Placeholders fit wherever port references do, and stay distinguishable at runtime." },
    { id: "R5", text: "Files of a world may import each other in cycles." },
    { id: "R6", text: "Reference cycles between nodes need no type annotations." },
    { id: "R7", text: "An implementor's inherited port is referenceable only if it implements the contract (tsc)." },
    { id: "R8", text: "A node with children is a dome: pure container, behavior = its children." },
    {
      id: "R9",
      text: "A rule tsc can pin on the offending element fails there with a readable Forbidden message; global rules are check's.",
    },
    {
      id: "R10",
      text: "A world has a required authored id in node-id form (any string, not format-checked), carried by the world object.",
    },
    { id: "C1", kind: "constraint", text: "No runtime dependencies, no imports and no side effects at runtime." },
    { id: "C2", kind: "constraint", text: "Node fields are derived from the node-spec types, never redeclared." },
  ],
  testCases: [
    { text: "Typos and deleted ports in uses and a dome's port mapping fail typecheck.", demonstrates: ["R1"] },
    {
      text: "Strings in uses, implements, children and a dome's port mapping fail typecheck.",
      demonstrates: ["R2"],
    },
    {
      text: "An external, abstract or not statically known dome, or a port of a non-child, fails typecheck.",
      demonstrates: ["R3"],
    },
    {
      text: "Two nodes share one placeholder; its $ref is 'unresolved', a real port's 'port'.",
      demonstrates: ["R4"],
    },
    { text: "Every lazy edge of the example world evaluates to no undefined.", demonstrates: ["R5"] },
    { text: "The package's source files have no runtime imports.", demonstrates: ["C1"] },
    {
      text: "The example's Orders <-> Stock and Shop <-> Orders cycles compile without annotations.",
      demonstrates: ["R5", "R6"],
    },
    {
      text: "inherited(Orders, AuditLog.history) compiles; with a node not implementing AuditLog it fails typecheck.",
      demonstrates: ["R7"],
    },
    {
      text: "Walking the example world's children finds each exported node once, under its parent.",
      demonstrates: ["R8"],
    },
    {
      text: "An external or abstract child, a port of a non-child, and empty children fail typecheck in node().",
      demonstrates: ["R3", "R9"],
    },
    {
      text: "Port clashes with inherited or other contracts' ports, duplicate requirement ids, unknown demonstrates ids and blank tbd descriptions fail typecheck on the offending element.",
      demonstrates: ["R9"],
    },
    { text: "defineWorld without an id fails typecheck; a world keeps its id.", demonstrates: ["R10"] },
  ],
  decisions: [
    {
      decision: "Node id: an authored uuidv7. Display name: the export name.",
      why: "Ids must survive renames and moves; the export name is unique per file and is what references use.",
      rejected: [
        { option: "A slug equal to the file name", why: "Renaming or moving a node breaks every stored reference." },
        { option: "Ids derived from the file path", why: "Moving a file changes the node's identity." },
        { option: "An authored name field", why: "Duplicates the export name and drifts from it." },
      ],
    },
    {
      decision: "The child declares its parent as a lazy node reference; no parent = top level.",
      why: "Placement stays in the node's file; tsc rejects external or abstract parents via literal-typed flags.",
      rejected: [
        {
          option: "Parent lists its children",
          why: "Each new child edits the parent's file; parent/child file cycles become the rule.",
        },
        {
          option: "Folder structure decides the parent",
          why: "Folders are convention; moving files must not change the model.",
        },
      ],
    },
    {
      decision:
        "Two steps: defineNode(static fields) is generic, infers the handle's type; .edges(lazy references) is not generic, returns the handle.",
      why: "Lazy edges allow cycles. The handle's type depends on step one only, so TS never infers a node's type through another node: cycles need no annotations, edge errors land on the offending element.",
      rejected: [
        {
          option: "One generic defineNode call with the edges, a return-type annotation per reference cycle",
          why: "TS cannot infer through a cycle (TS7022); easy to forget; delegating parents always hit it.",
        },
        { option: "Loosely typed edges needing no annotation", why: "Strings and external parents would pass tsc." },
        {
          option: "defineNode's draft usable as a node, .edges() optional",
          why: "The method would take a port name; draft plus node = two handles for one node.",
        },
      ],
    },
    {
      decision:
        "Ports: a record keyed by name. Handles expose own ports only; inherited ports via inherited(Node, Contract.port).",
      why: "A record makes Node.port resolve to its declaring key: go-to-definition and find-references work. Handle properties for inherited ports would need implements evaluated at definition; inherited() checks against the contracts in the handle's type instead.",
      rejected: [
        { option: "The node-spec port array", why: "Handle property access would not link to the declaration." },
        {
          option: "The contract's port (AuditLog.history) for an implementor's port",
          why: "The node spec tells depending on a contract from depending on an implementation.",
        },
      ],
    },
    {
      decision:
        "References branded by type-only classes with a #private member; the loader resolves by object identity.",
      why: "No string, look-alike literal or spread of a real reference ({ ...Stock.reserve, name: 'x' }) has the member; nothing exists at runtime.",
      rejected: [
        {
          option: "unique symbol phantom brands",
          why: "Spreads copy symbol-keyed properties: forged references passed tsc.",
        },
        { option: "Resolving references by id and name", why: "A forged object cast past the types would resolve." },
      ],
    },
    {
      decision: "Node types live here as plain type-only TypeScript: no TypeBox schemas, no JSON reader or writer.",
      why: "The TS files are the format, so nothing reads node JSON; the shipped .d.ts must be self-contained.",
      rejected: [
        {
          option: "Importing the types from @nuhokai/shared/spec",
          why: "It also holds TypeBox schemas: the .d.ts would need node_modules.",
        },
      ],
    },
    {
      decision:
        "Overrides 'the child declares its parent': one world file, nuhokai/index.ts, holds the hierarchy; its default export defineWorld({ children }) lists every node; nesting via explicit relation({ parent, children }); node files never import the world file. delegate moves to step one, so relation() checks delegate targets are direct children; .edges() keeps only uses.",
      why: "The hierarchy was scattered across node files, visible only to a loader; the map of islands and domes must read in one place. Delegation points down only, so its targets in the handle's type form no cycle; uses may point anywhere and stays in step two (TS7022). Example world (tsc 7.0.2, --extendedDiagnostics, median of 8): 3,590 → 7,394 types, 5,077 → 14,404 instantiations, 0.012s → 0.030s check; synthetic 200-node world: 0.15s → 0.5s.",
      rejected: [
        {
          option: "Tuples, children: [Postgres, [Shop, [Orders, Stock]]]",
          why: "Unreadable: only position tells a parent from its first child; brackets hide the structure the file exists to show.",
        },
        {
          option: "Keeping parent in .edges()",
          why: "Hierarchy stays scattered; tsc cannot check delegate targets against children.",
        },
        {
          option: "Checking uses scope in tsc",
          why: "Uses in the handle's type bring back TS7022; check checks scope against the world tree.",
        },
      ],
    },
    {
      decision:
        "A rule goes into tsc only if its error lands on the offending element with a readable Forbidden message. Global rules (duplicate ids, orphans, uses scope, unique export names) are check's; it re-checks every tsc rule, since a cast bypasses the types. The loader only evaluates and reports evaluation failures.",
      why: "check prints one list, so each message must point at its culprit; an error placeable only on defineWorld helps no one.",
      rejected: [
        {
          option: "Every rule in tsc",
          why: "Global rules would point at defineWorld; uses scope would need uses in the types (TS7022).",
        },
        {
          option: "Rules as tuples intersected with the authored arrays, also when satisfied",
          why: "TS compares the arrays method by method: 200-node world 2.2s instead of 0.6s (measured with the since-dropped uuidv7 check).",
        },
      ],
    },
    {
      decision:
        "Overrides 'Overrides the child declares its parent': a node with children is a dome, no behavior of its own. node() alone holds the hierarchy: children = record of direct children; a dome's ports reference theirs (`ports: (c) => ({ run: c.cmd.ports.run })`). No relation(); the world file lists only top-level nodes; a dome port's child reference replaces delegate.",
      why: "A boundary is its children: an Init calling its pieces as siblings is code in a node costume. Children inside the node make the dome's behavior exactly its interior, keep child names by the port mapping, and let tsc check every exposed port belongs to a direct child. Child references point only down: no type cycle.",
      rejected: [
        {
          option: "Keep relation() in the world file and delegate in the parent",
          why: "Splits one boundary across two files; a parent could declare behavior next to its children.",
        },
        {
          option: "A dome declares its own ports and delegates by name",
          why: "Port definitions can drift from the child port; referencing it copies kind and shapes.",
        },
        {
          option: "Children as an array without names",
          why: "`c.cmd.ports.run` needs a local child name; positions make the mapping unreadable.",
        },
      ],
    },
    {
      decision:
        "An id is any authored string (NodeId), unique in the world, not necessarily uuidv7; tsc does not check its format.",
      why: "It only has to survive renames and moves, which any authored string does; uuidv7 is unsettled, and validating it was about half of all instantiations.",
      rejected: [
        {
          option: "Validating uuidv7 in tsc (length, hex, version, variant)",
          why: "Commits an undecided format, ~half the check time; uniqueness, which matters, is check's anyway.",
        },
      ],
    },
    {
      decision: "A world has its own authored id, in node-id form.",
      why: "Tools keep per-world state apart by it, e.g. the map's saved layout, since all file:// pages share one storage; it survives renames and moves like a node's.",
      rejected: [
        {
          option: "Key per-world state by the project directory's path",
          why: "Not part of the world, changes on a move, puts the path into generated bytes.",
        },
        {
          option: "Key it by a node id",
          why: "Node ids are unique only within a world; init scaffolds the same example id into every project.",
        },
      ],
    },
  ],
}).edges({});
