import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { Inspect } from "../inspect.ts";
import { ResolveTarget } from "../resolve-target.ts";
import { WorldPath } from "../world-path.ts";
import { Publish } from "./publish.ts";

/** The program inside Init's boundary. */
export const Scaffold = node({
  id: "01a17290-3f10-7c48-a1d2-6b8e04c95f27",
  purpose:
    "The program inside Init's boundary: resolve the target, inspect it, hand the outcome to Publish, then print the " +
    "result. Owns no data, file or template; target, layout and failure concerns are shared top-level nodes.",
  status: "built",
  source: ["packages/cli/src/init/scaffold.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Create the world at the target",
      input: "the cwd",
      output:
        "exit code 0 or 1; the four written paths from the project root, or the nothing-to-do line on stdout, errors on stderr",
      errors: [
        "nuhokai exists but is not a directory",
        "no git and no terminal",
        "the user declined the cwd",
        "the write failed",
      ],
    },
  },
  requirements: [
    { id: "R1", text: "absent → create; world → nothing to do; occupied → one error." },
    { id: "R2", text: "Order: resolve, inspect, publish." },
    { id: "R3", text: "No file, template or staging access of its own." },
    {
      id: "R4",
      text: "A child's error becomes one stderr line, newlines collapsed, otherwise unchanged; the run port's lines are printed here.",
    },
  ],
  testCases: [
    {
      text: "A fresh repo yields the four paths; an existing world the nothing-to-do line; anything else one error line, nothing written.",
      demonstrates: ["R1", "R2", "R4"],
    },
    { text: "No git and no TTY yields one error and nothing written.", demonstrates: ["R4"] },
  ],
  decisions: [
    {
      decision: "Scaffold is a sibling of Init's content domains and calls them and the shared nodes by `uses`.",
      why: "Delegation only points down and a parent cannot use its own children; a coordinator inside the dome must be a sibling. Top-level target nodes are siblings of Init, so `uses` reaches them.",
      rejected: [
        { option: "Init delegates one port per domain", why: "Sequencing moves to Cli and the boundary leaks." },
        { option: "Publish, Inspect and ResolveTarget inside Scaffold", why: "The same problem one level down." },
      ],
    },
  ],
}).edges({
  uses: () => [ResolveTarget.resolve, Inspect.inspect, WorldPath.file, Failure.format, Failure.isExpected, Publish.run],
});
