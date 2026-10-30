import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";
import { CliFiles } from "./cli-files.ts";
import { ExampleWorld } from "./example-world.ts";

/** The all-or-nothing write transaction. */
export const Publish = node({
  id: "01a17290-3f10-7c51-84a6-1e93f5d70c48",
  purpose:
    "Make a complete world appear in the project directory or leave nothing: staged inside it, filled by the two " +
    "content nodes, committed in one step. Atomicity only, no content.",
  status: "built",
  source: ["src/init/publish.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Stage the world and commit it",
      input: "project directory, cwd-relative",
      output: "paths written, cwd-relative",
      errors: ["project directory not writable", "a writer failed", "commit failed"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Content goes into a fresh, dot-prefixed staging directory inside the project directory, then one commit.",
    },
    { id: "R2", text: "Any failure removes the staging directory; nothing outside it is touched." },
    { id: "R3", text: "Filled only through ExampleWorld.write and CliFiles.write; no content of its own." },
    { id: "R4", text: "The world is never visible half-written." },
    { id: "C1", kind: "constraint", text: "No temporary path survives, on success or failure." },
  ],
  testCases: [
    {
      text: "Unwritable project directory, writer failure or failed commit → no nuhokai/, no staging directory.",
      demonstrates: ["R2", "R4", "C1"],
    },
    { text: "Success → the complete world, written by the two content nodes.", demonstrates: ["R1", "R3"] },
  ],
  decisions: [
    {
      decision: "Atomicity lives here: stage inside the project directory, commit in one step.",
      why: "Same filesystem keeps the commit atomic; a failure leaves no world; no content writer knows about staging.",
      rejected: [
        { option: "Write in place", why: "A failure leaves a half-written world." },
        { option: "Stage outside the project directory", why: "Cross-device commit is copy plus delete, not atomic." },
        { option: "Each writer commits", why: "Two commits make a partial world possible." },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file, ExampleWorld.write, CliFiles.write] });
