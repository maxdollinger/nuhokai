import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";

/** The authored example a new world starts with. Owns its bytes. */
export const ExampleWorld = node({
  id: "01a17290-3f10-7c52-b7f0-5c28d914ae6b",
  purpose:
    "Own the example world: world file under a fresh world id, plus one node, Example, in its own file. " +
    "Writes only into the given directory; never picks where a world goes.",
  status: "built",
  source: ["packages/cli/src/init/example-world.ts"],
  ports: {
    write: {
      kind: "call",
      purpose: "Write the example world",
      input: "an existing directory",
      output: "the two paths in nuhokai/: index.ts, example.ts",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Exactly two files in the project directory: nuhokai/index.ts, nuhokai/example.ts; nothing outside the given directory.",
    },
    {
      id: "R2",
      text: "Files type-check and load as a world of exactly one node, Example, whose file shows a port, a tbd port and a uses edge.",
    },
    {
      id: "R3",
      text: "Only the world id varies per run (fresh uuidv7); all else, Example's id included, is a constant template; no timestamps.",
    },
    { id: "C1", kind: "constraint", text: "Empty children are invalid; the example's never are." },
  ],
  testCases: [
    {
      text: "Written files type-check and load as one node, Example, showing a port, a tbd port and a uses edge.",
      demonstrates: ["R2"],
    },
    {
      text: "Two runs into two directories differ only in the world id; each holds only the two files.",
      demonstrates: ["R1", "R3"],
    },
  ],
  decisions: [
    {
      decision: "Constant template: one node, Example, in its own file, under a fresh world id per run.",
      why: "The format rejects empty children; one real example shows a port, a tbd port and a uses edge to it, copyable by a user or LLM without a second node. Tools key per-world state by world id, so each project needs its own.",
      rejected: [
        {
          option: "Relax defineWorld to accept an empty world",
          why: "Weakens a rule for one state; empty relation children stay invalid.",
        },
        {
          option: "A constant world id",
          why: "All projects share one key: their maps' saved layouts overwrite each other.",
        },
        {
          option: "A fresh Example id per run",
          why: "Node ids are unique per world only and per-world state is keyed by world id; `new` generates an id per authored node.",
        },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
