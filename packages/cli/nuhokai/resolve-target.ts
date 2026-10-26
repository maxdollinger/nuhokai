import { defineNode } from "@nuhokai/world";

/** Where a world belongs. Reads only. */
export const ResolveTarget = defineNode({
  id: "01a17290-3f10-7c49-8b7d-2f5a9c10de63",
  purpose:
    "Find the directory a world belongs to: the Git root, else the cwd once the user confirms it. Reads only; " +
    "never writes and never inspects what is there.",
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
    { id: "R2", text: "Without Git or outside a repo: the cwd, only after an explicit yes." },
    { id: "R3", text: "Reads only; spawns at most git." },
    { id: "C1", kind: "constraint", text: "No flag or env var influences the root." },
  ],
  testCases: [
    { text: "From src/ inside a repo the root is the work-tree root, no prompt.", demonstrates: ["R1"] },
    { text: "No git and no TTY: one error, nothing written.", demonstrates: ["R2", "R3"] },
    { text: "Answering no writes nothing; yes uses the cwd.", demonstrates: ["R2"] },
  ],
  decisions: [
    {
      decision: "The Git root; without Git, the cwd after confirmation.",
      why: "A world belongs to the repo, so a subdirectory must not create a second one; the cwd is the only remaining guess.",
      rejected: [
        { option: "cwd only", why: "Running from src/ creates a world the root never sees." },
        { option: "Search upward for package.json", why: "A second heuristic with its own wrong answers." },
      ],
    },
  ],
}).edges({});
