import { node } from "@nuhokai/world";
import { WorldPath } from "./world-path.ts";

/** What sits at nuhokai/ in the project directory, as a verdict. Reads only. */
export const Inspect = node({
  id: "01a17290-3f10-7c50-9c2e-7d41b6a83e02",
  purpose:
    "Observe the project directory: absent, a world, or a file in the way at nuhokai/; and, for the commands that " +
    "need a world, turn anything but a world into one error. Shared by every command that reads or writes a world; " +
    "reads only; repairs, judges and writes nothing.",
  status: "built",
  source: ["packages/cli/src/shared/inspect.ts"],
  ports: {
    inspect: {
      kind: "call",
      purpose: "Say what is at nuhokai/ in the project directory",
      input: "the project directory",
      output: "absent | world | occupied: a non-directory sits at nuhokai/",
      errors: [],
    },
    requireWorld: {
      kind: "call",
      purpose: "Go on only if a world is there",
      input: "the project directory named from the cwd",
      output: "nothing; a world is there",
      errors: ["no nuhokai/ there: names init", "nuhokai exists but is not a directory"],
    },
  },
  requirements: [
    { id: "R1", text: "A directory at nuhokai/: world, whatever is inside it." },
    { id: "R2", text: "Anything there that is not a directory (a file, a symlink): occupied." },
    { id: "R3", text: "Nothing there: absent." },
    {
      id: "R4",
      text: "requireWorld: absent is one error naming init and the project directory as named from the cwd ('here' for the cwd); occupied is one error naming the path; a world passes.",
    },
    { id: "C1", kind: "constraint", text: "Reads only; no writes, no repair, no content checks." },
  ],
  testCases: [
    {
      text: "Nothing at nuhokai is absent; any directory is world; a file or a symlink is occupied.",
      demonstrates: ["R1", "R2", "R3"],
    },
    {
      text: "new and map without a world print 'no nuhokai/ here; …' in the cwd and 'no nuhokai/ in app; …' under --path app, and name app/nuhokai for a file there.",
      demonstrates: ["R4"],
    },
  ],
  decisions: [
    {
      decision: "Any directory counts as a world.",
      why: "A command never repairs or updates; a broken world is update's and check's business.",
      rejected: [
        {
          option: "Require nuhokai/index.ts or load and validate",
          why: "A command must work before the loader does; a half-written world is update's and check's business.",
        },
      ],
    },
    {
      decision: "new and map share requireWorld; init reads inspect itself, because absent is where it creates.",
      why: "The two commands that need a world fail the same way with the same words.",
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
