import { node } from "@nuhokai/world";

/** Which deprecation a node, or a use of its ports, is under. Pure. */
export const Deprecation = node({
  id: "01a1e9a9-e493-7690-a860-002bd868ce48",
  what: "Own the one answer to 'is this deprecated': for a node, and for a use of its ports, following a dome port to the child that handles it and an inherited port to its contract.",
  why: "Shared by check and review so they agree; judges nothing itself, so each says what a deprecation means for it. Pure: no I/O, never loads.",
  source: ["src/shared/deprecation.ts", "src/shared/deprecation.test.ts"],
  ports: {
    deprecationOf: {
      kind: "call",
      purpose: "Tell which deprecation a node is under",
      input: "the loaded world, a node",
      output: "{ note: trimmed, by: the node carrying it }, or none",
      errors: [],
    },
    deprecationsOfUse: {
      kind: "call",
      purpose: "Tell which deprecations a use of a node's ports meets",
      input: "the loaded world, the used node, the ports used",
      output: "{ note, by, ports: those leading to it }[], one per node carrying a note, in the ports' order",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "deprecationOf: a node is under its own deprecated note, else under that of the nearest dome around it; under none when neither has one. A note that is not a string, or blank, says nothing; the note is answered trimmed.",
    },
    {
      id: "R2",
      text: "deprecationsOfUse: per used port, the first deprecation (R1) along the nodes the port leads through: the used node, then down each dome port's delegate to the child that handles it, or to the contract an inherited port comes from, until a node declares the port itself. Ports meeting the same node's note are one entry. A port that leads nowhere, or a delegate cycle in an unchecked world, ends where it is.",
    },
    { id: "C1", kind: "constraint", text: "No filesystem access, load or printing." },
  ],
  testCases: [
    {
      text: "Shop deprecated ' use Store ' around Orders around Lines (whose own note is blank) → Lines is under 'use Store' by Shop; Stock is under none.",
      demonstrates: ["R1"],
    },
    {
      text: "Box exposes run (Middle.run, which delegates to deprecated Inner), go (Kept) and keep (inherited from deprecated Store via Shelf): uses go, run, keep → Inner's note for run, Store's for keep; go and an unknown port → none; Inner's own run and stop → one entry naming both.",
      demonstrates: ["R2"],
    },
  ],
  decisions: [
    {
      decision: "A use is followed to the node that declares the port.",
      why: "A dome port and an inherited port are only names for another node's port: the edge is to the dome or the implementor, but the code behind it is the deprecated node's.",
      rejected: [
        {
          option: "Only the target's own note",
          why: "Deprecating a contract or a dome's child then warned almost nobody.",
        },
      ],
    },
  ],
}).edges({});
