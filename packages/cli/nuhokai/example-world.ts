import { defineNode } from "@nuhokai/world";

/** The authored example a new world starts with. Owns its bytes. */
export const ExampleWorld = defineNode({
  id: "01a17290-3f10-7c52-b7f0-5c28d914ae6b",
  purpose:
    "Own the authored example world: one node, Example, in its own file, with a port, a tbd port and a uses edge. " +
    "Writes only into the directory it is given; never decides where a world goes.",
  status: "planned",
  source: [],
  ports: {
    write: {
      kind: "call",
      purpose: "Lay down the authored example world",
      input: "an existing directory",
      output: "the two paths, nuhokai/index.ts and nuhokai/example.ts",
      errors: ["the embedded template is missing"],
    },
  },
  requirements: [
    { id: "R1", text: "Exactly two files, relative to the given directory; nothing else." },
    { id: "R2", text: "The written world loads with exactly one node, Example." },
    { id: "R3", text: "Byte-identical per CLI version: constants, no timestamps, nothing per run." },
    { id: "R4", text: "Writes only inside the given directory." },
    { id: "C1", kind: "constraint", text: "Empty children are invalid; the example never is." },
  ],
  testCases: [
    { text: "Loading the written index.ts yields a world with one node, Example.", demonstrates: ["R2"] },
    { text: "Two runs into two directories give identical bytes.", demonstrates: ["R1", "R3"] },
    { text: "The directory holds only the two files afterwards.", demonstrates: ["R1", "R4"] },
  ],
  decisions: [
    {
      decision: "A constant template holding one example node, Example, in its own file.",
      why: "The format rejects empty children; a real example shows a port, a tbd port and a uses edge, which a user or an LLM copies.",
      rejected: [
        {
          option: "Relax defineWorld to accept an empty world",
          why: "Weakens a rule for one state; empty relation children stay invalid.",
        },
        { option: "A bare node without ports", why: "Teaches nothing about ports, edges or tbd." },
        { option: "uuidv7 per run", why: "Ids need only be unique per world; constants keep output byte-identical." },
      ],
    },
  ],
}).edges({});
