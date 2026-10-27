import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";

/** The authored example a new world starts with. Owns its bytes. */
export const ExampleWorld = node({
  id: "01a17290-3f10-7c52-b7f0-5c28d914ae6b",
  purpose:
    "Own the authored example world: the world file under a fresh world id, and one node, Example, in its own file, " +
    "with a port, a tbd port and a uses edge. " +
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
    {
      id: "R3",
      text: "Per run only the world id: a fresh uuidv7. Everything else, Example's id included, is a constant template; no timestamps.",
    },
    { id: "C1", kind: "constraint", text: "Empty children are invalid; the example never is." },
  ],
  testCases: [
    {
      text: "The written files type-check and load as a world with one node, Example, showing a port, a tbd port and a uses edge.",
      demonstrates: ["R2"],
    },
    {
      text: "Two runs into two directories differ only in the world id, and each directory holds only the two files.",
      demonstrates: ["R1", "R3"],
    },
  ],
  decisions: [
    {
      decision:
        "A constant template holding one example node, Example, in its own file, under a fresh world id per run.",
      why: "The format rejects empty children; a real example shows a port, a tbd port and a uses edge to it, which a user or an LLM copies without needing a second node. Tools key per-world state by the world id, so each project needs its own.",
      rejected: [
        {
          option: "Relax defineWorld to accept an empty world",
          why: "Weakens a rule for one state; empty relation children stay invalid.",
        },
        {
          option: "A constant world id",
          why: "Every project would share one key: their maps' saved layouts overwrite each other.",
        },
        {
          option: "A fresh Example id per run",
          why: "Node ids are unique per world only, and per-world state is keyed by the world id; `new` generates an id per authored node.",
        },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
