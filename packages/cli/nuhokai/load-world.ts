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
        "nodes: every node reachable from nuhokai/index.ts as a NodeSpec; tbd placeholders: every tbd placeholder those nodes use, with its kind, description and the ids of its users",
      errors: [
        "no nuhokai/index.ts",
        "a world file failed to evaluate",
        "the default export of nuhokai/index.ts is not a world",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Evaluates every .ts file under nuhokai/ except .generated/, *.d.ts and *.test.ts; @nuhokai/world resolves to the CLI's own runtime, also over the paths mapping in nuhokai/tsconfig.json, so the repo needs no node_modules.",
    },
    {
      id: "R2",
      text: "Each node is the NodeSpec that packages/world/README.md maps it to; a node exported under two names takes the first in sorted file order, a node without an export is named by its id.",
    },
    {
      id: "R3",
      text: "Order: depth-first from defineWorld's children, each parent before its children, children in record order; each node appears once, at its first listing.",
    },
    {
      id: "R4",
      text: "A tbd placeholder is no edge: one per tbd object, however many nodes use it, with its kind, description and its users' ids; ordered by first use in node order.",
    },
    {
      id: "R5",
      text: "Every load error is a CliError naming the nuhokai/ file, e.g. 'nuhokai/orders.ts: <message>'.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "No global rules: duplicate ids, orphans, uses scope and names are check's; only what stops a NodeSpec from being built is an error.",
    },
    { id: "C2", kind: "constraint", text: "The loader itself reads only; it writes, spawns and prompts nothing." },
  ],
  testCases: [
    {
      text: "After init, with no node_modules and the CLI-owned tsconfig in place, the world loads as one node, Example, named by its export, plus its tbd placeholder.",
      demonstrates: ["R1", "R2", "R4"],
    },
    {
      text: "In a world where a dome's child uses two ports of one target and a node is listed twice, the child has one uses edge listing both ports, the dome's ports keep their delegates, and the twice-listed node appears once, at its first listing, in record order.",
      demonstrates: ["R2", "R3"],
    },
    {
      text: "A tbd placeholder used by two nodes is one placeholder listing both ids, and neither node has an edge for it.",
      demonstrates: ["R4"],
    },
    {
      text: "A syntax error, a throwing node file and a default export that is not a world each give one CliError naming the file; a node without an export is named by its id.",
      demonstrates: ["R2", "R5"],
    },
  ],
  decisions: [
    {
      decision: "One top-level loader whose output is @nuhokai/world's NodeSpec plus the tbd placeholders.",
      why: "node-spec.ts is the only source of truth for node fields, and check will read the same world.",
      rejected: [
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
      why: "NodeSpec has no edge without a target node, and one tbd placeholder can have many users.",
      rejected: [{ option: "A hole edge kind on NodeSpec", why: "Redeclares a node field outside node-spec.ts." }],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
