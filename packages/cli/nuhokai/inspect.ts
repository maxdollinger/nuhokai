import { node } from "@nuhokai/world";
import { WorldPath } from "./world-path.ts";

/** What sits at nuhokai/ in the project directory, as a verdict. Reads only. */
export const Inspect = node({
  id: "01a17290-3f10-7c50-9c2e-7d41b6a83e02",
  purpose:
    "Observe nuhokai/ in the project directory: absent, world or occupied; for commands needing a world, turn " +
    "anything else into one error. Shared; reads only.",
  status: "built",
  source: ["src/shared/inspect.ts"],
  ports: {
    inspect: {
      kind: "call",
      purpose: "What is at nuhokai/ in the project directory",
      input: "project directory",
      output: "absent | world | occupied (a non-directory at nuhokai/)",
      errors: [],
    },
    requireWorld: {
      kind: "call",
      purpose: "Continue only if a world is there",
      input: "project directory, cwd-relative",
      output: "nothing; a world is there",
      errors: ["no nuhokai/ there: names init", "nuhokai exists but is not a directory"],
    },
  },
  requirements: [
    { id: "R1", text: "Directory at nuhokai/ → world, whatever is inside." },
    { id: "R2", text: "Non-directory there (file, symlink) → occupied." },
    { id: "R3", text: "Nothing there → absent." },
    {
      id: "R4",
      text: "requireWorld: absent → one error naming init and the cwd-relative project directory ('here' for the cwd); occupied → one error naming the path, except a symlink to a directory; world passes.",
    },
    { id: "C1", kind: "constraint", text: "Reads only; no writes, repair or content checks." },
  ],
  testCases: [
    {
      text: "Nothing at nuhokai → absent; any directory → world; file or symlink → occupied.",
      demonstrates: ["R1", "R2", "R3"],
    },
    {
      text: "new and map without a world print 'no nuhokai/ here; …' in the cwd, 'no nuhokai/ in app; …' under --path app, and name app/nuhokai for a file there.",
      demonstrates: ["R4"],
    },
    {
      text: "nuhokai -> ../shared/nuhokai: inspect → occupied, so init refuses it; map and new work in the linked folder.",
      demonstrates: ["R2", "R4"],
    },
  ],
  decisions: [
    {
      decision: "Any directory counts as a world.",
      why: "Commands never repair or update; a broken world is update's and check's business.",
      rejected: [
        {
          option: "Require nuhokai/index.ts or load and validate",
          why: "Commands must work before the loader does; a half-written world is update's and check's too.",
        },
      ],
    },
    {
      decision: "check, new and map share requireWorld; init reads inspect itself, since absent is where it creates.",
      why: "The commands that need a world fail alike, in the same words.",
    },
    {
      decision: "requireWorld follows symlinks; inspect does not.",
      why: "A linked world (nuhokai -> ../shared/nuhokai) is read and written through the link; init never creates through one.",
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
