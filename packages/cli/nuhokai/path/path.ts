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
    "src/shared/paths.ts",
    "src/shared/paths.test.ts",
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
  children: { worldPath: WorldPath, nodePath: NodePath },
  ports: (c) => ({
    file: c.worldPath.ports.file,
    project: c.worldPath.ports.project,
    nodePaths: c.nodePath.ports.paths,
    findNode: c.nodePath.ports.find,
  }),
}).edges({});
