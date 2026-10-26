import { node } from "@nuhokai/world";

/** The target's current state, as a verdict. Reads only, decides nothing. */
export const Inspect = node({
  id: "01a17290-3f10-7c50-9c2e-7d41b6a83e02",
  purpose: "Observe the target: absent, a world, or a file in the way. Reads only; repairs, judges and writes nothing.",
  status: "planned",
  source: [],
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
    { id: "R2", text: "A non-directory there: occupied." },
    { id: "R3", text: "Nothing there: absent." },
    { id: "C1", kind: "constraint", text: "Reads only; no writes, no repair, no content checks." },
  ],
  testCases: [
    { text: "An empty or unrelated nuhokai/ directory is world; a fresh repo is absent.", demonstrates: ["R1", "R3"] },
    { text: "A file named nuhokai gives occupied.", demonstrates: ["R2"] },
  ],
  decisions: [
    {
      decision: "Any directory counts as a world.",
      why: "Init never repairs or updates; a broken world is update's and check's business.",
      rejected: [
        { option: "Require nuhokai/index.ts", why: "Turns a no-op into an error for a half-written world." },
        { option: "Load and validate", why: "Init must work before the loader does." },
      ],
    },
  ],
}).edges({});
