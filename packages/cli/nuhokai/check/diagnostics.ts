import { node } from "@nuhokai/world";

/** Shared by SpecCheck and CodeCheck. */
export const Diagnostics = node({
  id: "01a18319-8a0c-755d-855a-72794bb4cdf1",
  purpose: "Turn findings into lines a human or agent can act on without opening the world.",
  status: "planned",
  source: [],
  requirements: [
    { id: "R1", text: "Each line is enough to act on alone: it names the node, the broken rule and the fix." },
  ],
}).edges({});
