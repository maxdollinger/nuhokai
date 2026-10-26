import { node } from "@nuhokai/world";
import { WorldPath } from "./world-path.ts";

/** The world as plain data in the shape @nuhokai/world defines. Evaluates, judges nothing. */
export const LoadWorld = node({
  id: "01a179c9-f7b6-7074-9245-bb542a950ec4",
  purpose:
    "Turn a repo's world into plain data: evaluate nuhokai/ in-process through the CLI's own @nuhokai/world " +
    "runtime, name every node by its export, resolve every reference by identity and answer the nodes as NodeSpec, " +
    "plus the tbd placeholders they use. Shared by every command that reads a world; checks no rule, writes nothing.",
  status: "planned",
  source: ["packages/cli/src/load/**"],
  ports: {
    load: {
      kind: "call",
      purpose: "Load the world at the root",
      input: "the project root",
      output:
        "nodes: every node reachable from nuhokai/index.ts as a NodeSpec; tbd placeholders: every tbd placeholder those nodes use, with its kind, description, export name if any and the ids of its users",
      errors: [
        "no nuhokai/index.ts",
        "a world file failed to evaluate",
        "the default export of nuhokai/index.ts is not a world",
        "a reachable node has no export name",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Evaluates every .ts file under nuhokai/ except .generated/, *.d.ts and *.test.ts; @nuhokai/world resolves to the CLI's own runtime, so the repo needs no node_modules.",
    },
    {
      id: "R2",
      text: "Each node is the NodeSpec the world format maps it to (packages/world/README.md): name its export, the first in sorted file order when exported twice; parent the dome whose children hold it, null at the top level; a dome port keeps its delegate; uses grouped into one edge per target node, an inherited reference at the implementor; every other field as authored.",
    },
    {
      id: "R3",
      text: "Order: depth-first from defineWorld's children, each parent before its children, children in record order; a node listed twice appears once, at its first listing.",
    },
    {
      id: "R4",
      text: "A tbd placeholder is no edge: one per tbd object, however many nodes use it, named by its export if it has one, listing its users' ids; ordered by first use in node order.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "No global rules: duplicate ids, orphans, uses scope and names are check's, including those the world README assigns to the loader; only what stops a NodeSpec from being built is an error.",
    },
    { id: "C2", kind: "constraint", text: "Reads only; writes nothing, spawns nothing, prompts nothing." },
  ],
  testCases: [
    {
      text: "The example world of @nuhokai/world, copied into a temp repo's nuhokai/ with its imports pointing at @nuhokai/world and no node_modules, loads: names are the export names, Shop's ports delegate to Orders, and Orders has one uses edge per target node.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "Shop comes before Orders and Stock, in record order, and two loads give equal results.",
      demonstrates: ["R3"],
    },
    {
      text: "notifyCustomer, used by Orders and Stock, is one tbd placeholder named notifyCustomer listing both ids, and neither node has an edge for it.",
      demonstrates: ["R4"],
    },
    {
      text: "A syntax error, a throwing node file, a default export that is not a world and an inline node without an export are each one error.",
      demonstrates: ["R1", "R2"],
    },
  ],
  decisions: [
    {
      decision: "One top-level loader whose output is @nuhokai/world's NodeSpec plus the tbd placeholders.",
      why: "node-spec.ts is the only source of truth for node fields, so the map and check read one plain, serializable shape with no handles, lazy functions or identity resolution left to repeat.",
      rejected: [
        { option: "Hand consumers the handles", why: "Every consumer re-implements naming and identity resolution." },
        {
          option: "A model shaped for the map",
          why: "Couples the loader to one consumer; check would need a second model.",
        },
        {
          option: "The loader inside the map command",
          why: "check needs the same evaluation, and uses cannot reach into another command's dome.",
        },
      ],
    },
    {
      decision: "Evaluate every node file, not only the files index.ts imports.",
      why: "Handles carry no name, so every node's name comes from the modules' exports.",
      rejected: [{ option: "Follow imports from index.ts", why: "Needs the module graph to find the same exports." }],
    },
    {
      decision: "tbd placeholders are a second list beside the nodes, not edges.",
      why: "The map must show what is not designed yet, but NodeSpec has no edge without a target node; a tbd placeholder is a world-level fact (one hole, many users), so it sits next to the nodes and no node field is redeclared.",
      rejected: [
        { option: "A hole edge kind on NodeSpec", why: "Redeclares a node field outside node-spec.ts." },
        { option: "Leave tbd placeholders out", why: "The map would hide the open parts of the design." },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
