import { node } from "@nuhokai/world";
import { WorldPath } from "./world-path.ts";

/** The world as plain data in the shape @nuhokai/world defines. Evaluates, judges nothing. */
export const LoadWorld = node({
  id: "01a179c9-f7b6-7074-9245-bb542a950ec4",
  purpose:
    "Turn a repo's world into plain data: evaluate nuhokai/ in-process through the CLI's own @nuhokai/world " +
    "runtime, name every node by its export, resolve every reference by identity and answer the nodes as NodeSpec, " +
    "plus the tbd placeholders they use. " +
    "Shared by every command that reads a world; checks no rule, writes nothing.",
  status: "planned",
  source: ["packages/cli/src/load/**"],
  ports: {
    load: {
      kind: "call",
      purpose: "Load the world at the root",
      input: "the project root",
      output:
        "nodes: every node reachable from nuhokai/index.ts as a NodeSpec from @nuhokai/world, flat, each parent before its children, in authored order; placeholders: every tbd port those nodes use, with its kind, description, export name if any, and the ids of the nodes using it",
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
      text: "A node's name is its export name; under two names, the first in sorted file order wins. id, purpose, status, source, flags, group, externalType, requirements, testCases and decisions are copied unchanged.",
    },
    {
      id: "R3",
      text: "parent is the dome whose children record holds the node, null at the top level; ports become an array carrying their name, a dome port keeps its delegate.",
    },
    {
      id: "R4",
      text: "uses references become one uses edge per target node listing its ports, inherited references point at the implementor; implements becomes one edge per contract; a tbd placeholder is not an edge but a placeholder listing that node in its users.",
    },
    {
      id: "R5",
      text: "Order: depth-first from defineWorld's children, each parent before its children, children in record order; the same world gives the same list.",
    },
    {
      id: "R6",
      text: "One placeholder per tbd object, however many nodes use it, named by its export like a node; placeholders are ordered by first use in node order.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "No global rules: duplicate ids, orphans, uses scope and names are check's; only what stops a NodeSpec from being built is an error.",
    },
    { id: "C2", kind: "constraint", text: "Reads only; writes nothing, spawns nothing, prompts nothing." },
  ],
  testCases: [
    {
      text: "The example world of @nuhokai/world loads as NodeSpecs whose names are the export names, with Shop's ports delegating to Orders and a uses edge per target node.",
      demonstrates: ["R2", "R3", "R4"],
    },
    {
      text: "A world in a temp repo without node_modules loads; a syntax error, a throwing node file or a default export that is not a world is one error.",
      demonstrates: ["R1"],
    },
    {
      text: "The example's notifyCustomer, used by Orders and Stock, is one placeholder named notifyCustomer listing both ids, and neither node has an edge for it.",
      demonstrates: ["R4", "R6"],
    },
    {
      text: "An inline node without an export is an error naming its id; two loads give equal results.",
      demonstrates: ["R5"],
    },
  ],
  decisions: [
    {
      decision: "One top-level loader whose output is @nuhokai/world's NodeSpec, the plain data every consumer shares.",
      why: "node-spec.ts is the only source of truth for node fields, so a map, check's rules and later tools all read one plain, serializable shape with no handles, lazy functions or identity games left to repeat.",
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
      why: "Handles carry no name, so names come from the modules' exports; and check's orphan rule needs the exported nodes the world does not reach, from the same pass.",
      rejected: [
        {
          option: "Follow imports from index.ts",
          why: "Needs the module graph, and still misses orphans.",
        },
      ],
    },
    {
      decision: "tbd placeholders are a second list beside the nodes, not edges.",
      why: "The map must show what is not designed yet, but NodeSpec has no edge without a target node; a placeholder is a world-level fact (one hole, many users), so it sits next to the nodes and no node field is redeclared.",
      rejected: [
        { option: "A hole edge kind on NodeSpec", why: "Redeclares a node field outside node-spec.ts." },
        { option: "Leave placeholders out", why: "The map would hide the open parts of the design." },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
