import { node } from "@nuhokai/world";

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
      output: "items: { ref, kind, text, file, line?, contract?: path }[], in spec order, the node's own first",
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
      text: "References by id or name, never by a position a reorder shifts, where the format gives one: purpose, requirements[R2], ports.run, ports.run.input, ports.run.output, ports.run.errors[1], ports.run.transport, edges.uses[LoadWorld], testCases[0], decisions[1], decisions[1].rejected[0].",
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
      text: "A requirement no test case demonstrates (kind constraint aside) is marked untested: the format calls it a gap.",
    },
    { id: "R5", text: "find matches exactly, case-sensitive; same world and node → the same items." },
    { id: "C1", kind: "constraint", text: "No filesystem access, load or printing." },
  ],
  testCases: [
    {
      text: "PrintTree → purpose, ports.run, its input, output and five errors, requirements[R1]–[R3], four edges.uses items (one per target: Failure.format and Failure.report are one edge), two test cases; requirements[R1] at nuhokai/tree/print-tree.ts and its line.",
      demonstrates: ["R1", "R3"],
    },
    {
      text: "Orders implements Store with requirement R1 and one test case → Store.requirements[R1] and Store.testCases[0] at Store's file; find('Store.requirements[R1]') → it; find('requirements[r1]') → none.",
      demonstrates: ["R2", "R5"],
    },
    {
      text: "R2 demonstrated by no test case → marked untested; a constraint C1 likewise → not marked.",
      demonstrates: ["R4"],
    },
  ],
}).edges({});
