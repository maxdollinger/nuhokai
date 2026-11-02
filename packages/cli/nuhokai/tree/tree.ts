import { node } from "@nuhokai/world";
import { PrintTree } from "./print-tree.ts";
import { TreeLines } from "./tree-lines.ts";

/** `nuhokai tree`: the node hierarchy, one line per node. Inside: PrintTree (program), TreeLines (the text). */
export const Tree = node({
  id: "01a19cc8-5db0-7318-ade1-ecb15430e2ed",
  purpose:
    "Print the world's node hierarchy, one line per node with its path, source and purpose, so agents and people " +
    "find a node step by step without reading the world, and copy its path into other commands. Never checks or writes.",
  status: "building",
  source: ["src/tree/**"],
  requirements: [
    {
      id: "R1",
      text: "stdout only, one line per node: path | source | purpose (TreeLines). Every line carries the node's full hierarchy path, so it still makes sense after grep and is accepted as printed by every command that takes a node.",
    },
    {
      id: "R2",
      text: "[node] starts from that node, else the top level; --level counts below the start, default 1, 0 = unlimited. A dome cut off by the level is marked '/ (<n>)'.",
    },
    {
      id: "R3",
      text: "Unchecked: any world that loads gets a tree; siblings sharing a name both print, and addressing them names nuhokai check.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "Arguments: an optional hierarchy path and --level; Cli parses both and owns --help and --path, Tree finds the node.",
    },
  ],
  testCases: [
    {
      text: "From the repo root, `tree --path packages/cli` → one line per top-level node of the CLI's world, Check collapsed as 'Check/ (5)', sources under packages/cli/; exit 0, no other output.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "In packages/cli, `tree Check -L 2` → Check, its five children, SpecCheck's three; `tree -L 0` → every node, none collapsed; `tree Chek` → did you mean 'Check', exit 2.",
      demonstrates: ["R2"],
    },
    {
      text: "A world with an orphan and a name clash among siblings → the tree prints both siblings, exit 0; `tree <clashing path>` → exit 2 naming nuhokai check.",
      demonstrates: ["R3"],
    },
  ],
  decisions: [
    {
      decision: "Command `nuhokai tree`, -L as in tree(1).",
      why: "Every command is one word; tree and -L are what people and agents already try.",
    },
    {
      decision: "One line per node with its full path; no indentation.",
      why: "A grep hit keeps its place in the hierarchy and the path can be copied as is; indentation would repeat what the path says.",
      rejected: [
        { option: "Indented names, as tree(1)", why: "A grep hit loses its parents; names alone are ambiguous." },
      ],
    },
    {
      decision: "The whole purpose, on the node's line.",
      why: "The purpose is what tells nodes apart, and its 'Never …' part says what a node is not, which agents need to pick the right one. On the same line, a grep for any word of it still shows the path.",
      rejected: [
        { option: "First line or sentence only", why: "Drops the boundary clause; purposes are one string anyway." },
        {
          option: "Purpose on its own indented line",
          why: "A grep hit in the purpose loses its path; two kinds of line to parse.",
        },
      ],
    },
    {
      decision: "Default level 1; 0 = unlimited.",
      why: "Step by step: an agent reads the top level, then drills into the dome it needs; a real world has hundreds of nodes.",
      rejected: [{ option: "The whole tree by default", why: "Floods the context the command exists to save." }],
    },
    {
      decision: "No ports, status or edges on the line, for now.",
      why: "Path, source and purpose find a node; add port names if agents pick the wrong nodes while dogfooding (MAX-37).",
    },
  ],
  children: { printTree: PrintTree, treeLines: TreeLines },
  ports: (c) => ({ run: c.printTree.ports.run }),
}).edges({});
