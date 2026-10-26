import { node } from "@nuhokai/world";

/** Where a world belongs. Writes no files. */
export const ResolveTarget = node({
  id: "01a17290-3f10-7c49-8b7d-2f5a9c10de63",
  purpose:
    "Find the directory a world belongs to: the Git root, else the cwd once the user confirms it. Writes no files; " +
    "reads the filesystem, spawns git and asks one yes/no question on the terminal. Never inspects what is there.",
  status: "planned",
  source: [],
  ports: {
    resolve: {
      kind: "call",
      purpose: "Resolve the root of the repo the cwd belongs to",
      input: "the cwd",
      output: "an absolute directory",
      errors: ["no git and no terminal", "the user declined the cwd"],
    },
  },
  requirements: [
    { id: "R1", text: "In a Git work tree: the work-tree root, even from a subdirectory, without prompting." },
    { id: "R2", text: "Without Git or outside a repo: the cwd, only after an explicit yes; no terminal is an error." },
    { id: "R3", text: "Writes no files; spawns at most git and reads one line from the terminal." },
    { id: "C1", kind: "constraint", text: "No flag or env var influences the root." },
  ],
  testCases: [
    { text: "From src/ inside a repo the root is the work-tree root, no prompt.", demonstrates: ["R1"] },
    {
      text: "Without git and no TTY: one error; on a TTY, 'no' writes nothing and 'yes' uses the cwd.",
      demonstrates: ["R2", "R3"],
    },
  ],
  decisions: [
    {
      decision: "The Git root; without Git, the cwd after one confirmation prompt.",
      why: "A world belongs to the repo, so a subdirectory must not create a second one; the cwd is the only remaining guess, and the prompt is the only interaction, so it lives here.",
      rejected: [
        { option: "cwd only", why: "Running from src/ creates a world the root never sees." },
        { option: "Search upward for package.json", why: "A second heuristic with its own wrong answers." },
      ],
    },
  ],
}).edges({});
