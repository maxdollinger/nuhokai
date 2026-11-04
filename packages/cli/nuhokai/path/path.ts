import { node } from "@nuhokai/world";
import { NodePath } from "./node-path.ts";
import { SourcePath } from "./source-path.ts";
import { WorldPath } from "./world-path.ts";

/** Paths as pointers: the name of a file (WorldPath) and of a node (NodePath), and source patterns (SourcePath). Pure. */
export const Path = node({
  id: "01a19cc8-5d9a-7657-a859-a70d644aa394",
  purpose:
    "Own paths as pointers: the names commands print and take back for files (WorldPath) and nodes (NodePath), and " +
    "the source patterns paths match (SourcePath). Pure: never touches the files behind them.",
  status: "building",
  source: [
    "src/shared/world-path.ts",
    "src/shared/world-path.test.ts",
    "src/shared/node-path.ts",
    "src/shared/node-path.test.ts",
  ],
  requirements: [
    {
      id: "R1",
      text: "A name printed by one command is accepted as printed by every other: files open from the cwd, node paths address the node.",
    },
    { id: "C1", kind: "constraint", text: "No filesystem access, load or printing." },
  ],
  decisions: [
    {
      decision: "Port names are the functions' names: nameInWorld, nameInProject, nameNodes, findNode, matches.",
      why: "One name per operation, in specs, code and tests alike; a reader of either finds the other.",
    },
    {
      decision: "One Path dome holds WorldPath, NodePath and SourcePath.",
      why: "All three work on a path alone, never on what it points at, and are shared by several commands; one shared island instead of three on the map.",
      rejected: [
        {
          option: "Each as one more top-level node",
          why: "The shared top level grows by a node per path rule, with nothing saying they belong together.",
        },
        {
          option: "Path also expands a source entry into the files that exist",
          why: "Listing files reads the disk; that is ProjectFiles' unit of work, and Path stays pure.",
        },
      ],
    },
  ],
  children: [WorldPath, NodePath, SourcePath],
  ports: {
    nameInWorld: WorldPath.nameInWorld,
    nameInProject: WorldPath.nameInProject,
    suggestedCommand: WorldPath.suggestedCommand,
    isInside: WorldPath.isInside,
    nameNodes: NodePath.nameNodes,
    findNode: NodePath.findNode,
    childrenOf: NodePath.childrenOf,
    isAncestor: NodePath.isAncestor,
    isGlob: SourcePath.isGlob,
    staticPrefix: SourcePath.staticPrefix,
    matches: SourcePath.matches,
  },
}).edges({});
