import { node } from "@nuhokai/world";

/** The target's current state, as a verdict. Reads only, decides nothing. */
export const Inspect = node({
  id: "01a17290-3f10-7c50-9c2e-7d41b6a83e02",
  purpose:
    "Observe the target: absent, a world, or a file in the way. Shared by every command that reads or writes a world; " +
    "reads only; repairs, judges and writes nothing.",
  status: "built",
  source: ["packages/cli/src/shared/inspect.ts"],
  ports: {
    inspect: {
      kind: "call",
      purpose: "Say what is at the target",
      input: "a directory",
      output: "absent | world | occupied: a non-directory sits at nuhokai/",
      errors: [],
    },
  },
  requirements: [
    { id: "R1", text: "A directory at nuhokai/: world, whatever is inside it." },
    { id: "R2", text: "Anything there that is not a directory (a file, a symlink): occupied." },
    { id: "R3", text: "Nothing there: absent." },
    { id: "C1", kind: "constraint", text: "Reads only; no writes, no repair, no content checks." },
  ],
  testCases: [
    {
      text: "Nothing at nuhokai is absent; any directory is world; a file or a symlink is occupied.",
      demonstrates: ["R1", "R2", "R3"],
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
  ],
}).edges({});
