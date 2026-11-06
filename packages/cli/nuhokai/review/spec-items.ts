import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";

/** The items of a node's spec a review cites, each by a stable reference. Pure. */
export const SpecItems = node({
  id: "01a1a638-3153-77af-bfa3-1a7298cb2542",
  purpose:
    "Own the reference of each spec item a review cites: list a node's items, its contracts' included, each with " +
    "where it is written, and find the item a reference names. Pure.",
  status: "building",
  source: ["src/review/spec-items.ts", "src/review/spec-items.test.ts"],
  ports: {
    list: {
      kind: "call",
      purpose: "Every item of a node's spec, with its reference",
      input: "the loaded world, a node's position",
      output:
        "items: { ref, kind, text, details?: lines below it, file, line?, contract?: path, untested? }[], in spec order, the node's own first",
      errors: [],
    },
    targets: {
      kind: "call",
      purpose: "Each uses edge's target, with the name its item cites",
      input: "the loaded world, a node's position",
      output: "{ name, ports, node? (none when the world never reaches it) }[], in the edges' order",
      errors: [],
    },
    find: {
      kind: "call",
      purpose: "The item a reference names",
      input: "the items as list gives them, a reference as typed",
      output: "the item, or none",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "References by id or name, never by a position a reorder shifts, where the format gives one, and only these: purpose, ports.run, requirements[R2], edges.uses[LoadWorld], testCases[0], decisions[1]. A port's input, output, errors, payload and transport, and a decision's rejected options, are its details, one line each below it, cited by the item's own reference.",
    },
    {
      id: "R2",
      text: "Inherited items: each contract's ports, requirements and test cases (the format's inheritance), prefixed by the contract's name: Store.requirements[R1]. Contracts come from LoadWorld's positions; a null one adds nothing.",
    },
    {
      id: "R3",
      text: "Each item carries its spec file and line (LoadWorld R15), an inherited one the contract's; without a line, the node's node() line.",
    },
    {
      id: "R4",
      text: "A requirement of the node's own that none of its test cases demonstrates (kind constraint aside) is marked untested: the format calls it a gap. A contract's never is: an implementor's test cases demonstrate only its own ids.",
    },
    {
      id: "R5",
      text: "find matches a reference as the prompt prints it (Failure.format's one line), exactly, case-sensitive; same world and node → the same items.",
    },
    {
      id: "R6",
      text: "A uses edge's item names its target (targets): by name, by path when two targets share one; a target the world never reaches (an orphan, LoadWorld R14) by its export name, else its id, never dropped. ReviewScope lists the same names, so prompt and validation agree.",
    },
    { id: "C1", kind: "constraint", text: "No filesystem access, load or printing." },
  ],
  testCases: [
    {
      text: "Orders implements Store, uses Stock.reserve, the orphan Lost and Stock.count, and has a decision with one rejected option → purpose, ports.place with its payload below it, its requirements, edges.uses[Stock] (reserve, count) and edges.uses[Lost], its test case, decisions[0] with the rejected option below it, then Store's ports, requirements and test case prefixed Store., at Store's lines; no ports.place.payload or decisions[0].rejected[0].",
      demonstrates: ["R1", "R2", "R3", "R6"],
    },
    {
      text: "R2 demonstrated by no test case → marked untested; a constraint C1, or the contract's R2 → not marked.",
      demonstrates: ["R4"],
    },
    {
      text: "find('Store.requirements[R1]') → it; find('requirements[r1]') → none; listing twice → the same items. A requirement id 'R  1' → found as requirements[R 1], as printed; not as written.",
      demonstrates: ["R5"],
    },
  ],
  decisions: [
    {
      decision: "Coarse references: one item per port and per decision, their fields and rejected options below them.",
      why: "An agent cites the port or decision it found broken; a reference per error index or rejected option added items to choose from without changing what the finding says.",
      rejected: [
        {
          option: "ports.run.errors[1], decisions[1].rejected[0]",
          why: "Positions inside a field shift on any edit, and a finding against one error is a finding against the port.",
        },
      ],
    },
  ],
}).edges({ uses: () => [Failure.format] });
