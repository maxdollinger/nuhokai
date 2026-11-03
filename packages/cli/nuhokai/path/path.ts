import { node } from "@nuhokai/world";
import { NodePath } from "./node-path.ts";
import { WorldPath } from "./world-path.ts";

/** Shared naming: the one name of a file (WorldPath) and of a node (NodePath). Pure. */
export const Path = node({
  id: "01a19cc8-5d9a-7657-a859-a70d644aa394",
  purpose:
    "Own the names the CLI prints and takes back: a file's, cwd-relative (WorldPath), and a node's, its hierarchy " +
    "path (NodePath). Shared by every command; pure, no I/O.",
  status: "built",
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
      decision: "Port names are the functions' names: nameInWorld, nameInProject, nameNodes, findNode.",
      why: "One name per operation, in specs, code and tests alike; a reader of either finds the other.",
    },
    {
      decision: "One Path dome holds WorldPath and NodePath.",
      why: "Both own 'the one name that is printed and read back', shared by every command; one shared island instead of two on the map.",
      rejected: [
        {
          option: "NodePath as one more top-level node beside WorldPath",
          why: "The shared top level grows by a node per naming rule, with nothing saying they belong together.",
        },
      ],
    },
  ],
  children: [WorldPath, NodePath],
  ports: {
    nameInWorld: WorldPath.nameInWorld,
    nameInProject: WorldPath.nameInProject,
    suggestedCommand: WorldPath.suggestedCommand,
    isInside: WorldPath.isInside,
    nameNodes: NodePath.nameNodes,
    findNode: NodePath.findNode,
    childrenOf: NodePath.childrenOf,
    isAncestor: NodePath.isAncestor,
  },
}).edges({});
