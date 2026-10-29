import { node } from "@nuhokai/world";

/** The spec check. */
export const SpecCheck = node({
  id: "01a18319-8a01-7669-8f66-8435e312227e",
  purpose: "Prove the loaded world is a valid spec, so the code can be checked against it.",
  status: "planned",
  source: [],
  requirements: [
    {
      id: "R1",
      text: "Every id is unique in the world, the world's own id included. A node listed in two places is a violation naming both places.",
    },
    {
      id: "R2",
      text: "Judges only nodes reachable from the world. An exported node that is not is a warning naming its file, never an error.",
    },
    {
      id: "R3",
      text: "A uses edge targets a port of a sibling or of an ancestor's sibling, the top level included, never a node inside one. Any other target is a violation naming the edge.",
    },
    {
      id: "R4",
      text: "Node names are unique among siblings, the top level included. A node's name in diagnostics is its path from the world, Check/SpecCheck. A clash is a violation naming both files.",
    },
    {
      id: "R5",
      text: "Every rule tsc enforces (node-spec, dome and world rules in packages/world/README.md) also holds in the loaded world: casts, suppressed errors and values tsc cannot see get past it. Each break is a violation.",
    },
    {
      id: "R6",
      text: "Every source entry, relative to the project directory, matches at least one file; one matching nothing is a violation naming the node and the entry.",
    },
    {
      id: "R7",
      text: "A file matched by the source of two nodes is a violation naming both and the file, unless one is the other's ancestor.",
    },
    { id: "R8", text: "Every violation states its fix, listing alternatives when there is a choice." },
  ],
  decisions: [
    {
      decision: "One owner per file, nesting aside.",
      why: "CodeCheck attributes code to one node; shared code is its own node.",
      rejected: [{ option: "Siblings share files", why: "Couples past ports." }],
    },
  ],
  ports: {
    run: {
      kind: "call",
      purpose: "Judge the loaded world against the spec rules",
      input: "the loaded world, as LoadWorld.load answers it",
      output: "findings: one per violation",
    },
  },
}).edges({});
