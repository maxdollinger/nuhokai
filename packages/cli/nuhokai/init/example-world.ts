import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";

/** The authored example a new world starts with. Owns its bytes. */
export const ExampleWorld = node({
  id: "01a17290-3f10-7c52-b7f0-5c28d914ae6b",
  purpose:
    "Own the authored example world: one node, Example, in its own file, with a port, a tbd port and a uses edge. " +
    "Writes only into the directory it is given; never decides where a world goes.",
  status: "built",
  source: ["packages/cli/src/init/example-world.ts"],
  ports: {
    write: {
      kind: "call",
      purpose: "Lay down the authored example world",
      input: "an existing directory",
      output: "the two paths inside the world folder, index.ts and example.ts",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Exactly two files, nuhokai/index.ts and nuhokai/example.ts in the project directory; nothing outside the given directory.",
    },
    {
      id: "R2",
      text: "The written files type-check and load as a world with exactly one node, Example, whose file shows a port, a tbd port and a uses edge.",
    },
    { id: "R3", text: "Byte-identical per CLI version: constant template ids, no timestamps, nothing per run." },
    { id: "C1", kind: "constraint", text: "Empty children are invalid; the example never is." },
  ],
  testCases: [
    {
      text: "The written files type-check and load as a world with one node, Example, showing a port, a tbd port and a uses edge.",
      demonstrates: ["R2"],
    },
    {
      text: "Two runs into two directories give identical bytes, and each directory holds only the two files.",
      demonstrates: ["R1", "R3"],
    },
  ],
  decisions: [
    {
      decision: "A constant template holding one example node, Example, in its own file.",
      why: "The format rejects empty children; a real example shows a port, a tbd port and a uses edge to it, which a user or an LLM copies without needing a second node.",
      rejected: [
        {
          option: "Relax defineWorld to accept an empty world",
          why: "Weakens a rule for one state; empty relation children stay invalid.",
        },
        {
          option: "uuidv7 per run",
          why: "Init's output is byte-identical; `new` generates an id per authored node.",
        },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
