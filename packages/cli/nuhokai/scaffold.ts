import { defineNode } from "@nuhokai/world";
import { Inspect } from "./inspect.ts";
import { Publish } from "./publish.ts";
import { ResolveTarget } from "./resolve-target.ts";

/** The program inside Init's boundary. */
export const Scaffold = defineNode({
  id: "01a17290-3f10-7c48-a1d2-6b8e04c95f27",
  purpose:
    "The program inside Init's boundary: resolve the target, inspect it, hand the outcome to Publish, map results to " +
    "the run port's lines. Owns no data, no file and no template.",
  status: "planned",
  source: [],
  ports: {
    run: {
      kind: "call",
      purpose: "Create the world at the target",
      input: "the cwd",
      output: "the four written paths, or `nuhokai/: already exists, nothing to do`",
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
    { id: "R4", text: "A child's error surfaces unchanged; the run port's lines are built here." },
  ],
  testCases: [
    { text: "A fresh repo yields the four paths.", demonstrates: ["R1", "R2"] },
    { text: "An existing world yields the nothing-to-do line and writes nothing.", demonstrates: ["R1"] },
    { text: "A file named nuhokai yields one error line.", demonstrates: ["R1", "R4"] },
    { text: "No git and no TTY yields one error and nothing written.", demonstrates: ["R4"] },
  ],
  decisions: [
    {
      decision: "Scaffold is a sibling of the domains and calls them by `uses`.",
      why: "Delegation only points down and a parent cannot use its own children; a coordinator inside the dome must be a sibling.",
      rejected: [
        { option: "Init delegates one port per domain", why: "Sequencing moves to Cli and the boundary leaks." },
        { option: "Publish, Inspect and ResolveTarget inside Scaffold", why: "The same problem one level down." },
      ],
    },
  ],
}).edges({ uses: () => [ResolveTarget.resolve, Inspect.inspect, Publish.run] });
