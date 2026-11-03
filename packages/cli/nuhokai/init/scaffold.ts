import { node } from "@nuhokai/world";
import { Failure } from "../failure.ts";
import { Inspect } from "../inspect.ts";
import { Path } from "../path/path.ts";
import { Publish } from "./publish.ts";

/** The program inside Init's boundary. */
export const Scaffold = node({
  id: "01a17290-3f10-7c48-a1d2-6b8e04c95f27",
  purpose:
    "The program inside Init: inspect the project directory, hand the outcome to Publish, return a Report. " +
    "Owns no data, file or template; never prints.",
  status: "built",
  source: ["src/init/scaffold.ts"],
  ports: {
    run: {
      kind: "call",
      purpose: "Create the world in the project directory",
      input: "project directory",
      output:
        "Report: ok with the four written paths (cwd-relative) or the nothing-to-do line as result lines; failed with one failure line",
      errors: ["nuhokai exists but is not a directory", "write failed"],
    },
  },
  requirements: [
    { id: "R1", text: "absent → create; world → nothing to do; occupied → one error." },
    { id: "R2", text: "Order: inspect, publish." },
    { id: "R3", text: "No file, template or staging access of its own." },
    {
      id: "R4",
      text: "A child's error → one failure line, newlines collapsed, otherwise unchanged; Cli prints the Report.",
    },
  ],
  testCases: [
    {
      text: "Fresh repo → the four paths; existing world → the nothing-to-do line; anything else → one error line, nothing written.",
      demonstrates: ["R1", "R2", "R4"],
    },
  ],
  decisions: [
    {
      decision: "Scaffold is a sibling of Init's content nodes and calls them and the shared nodes by `uses`.",
      why: "Delegation points down only and a parent cannot use its own children, so a coordinator inside the dome must be a sibling. The shared top-level nodes are Init's siblings, so `uses` reaches them.",
      rejected: [
        { option: "Init delegates one port per domain", why: "Sequencing moves to Cli and the boundary leaks." },
        { option: "Publish and Inspect inside Scaffold", why: "The same problem one level down." },
      ],
    },
  ],
}).edges({
  uses: () => [Inspect.inspect, Inspect.occupied, Path.nameInWorld, Failure.report, Publish.run],
});
