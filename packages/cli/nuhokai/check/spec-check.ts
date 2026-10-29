import { node } from "@nuhokai/world";

/** The spec check. */
export const SpecCheck = node({
  id: "01a18319-8a01-7669-8f66-8435e312227e",
  purpose: "Prove the loaded world is a valid spec, so the code can be checked against it.",
  status: "planned",
  source: [],
  requirements: [
    {
      id: "R1",
      text: "Every id is unique in the world, the world's own id included. A node listed in two places is a violation naming both places.",
    },
    { id: "R2", text: "Every exported node is reachable from the world; an orphan is a violation naming its file." },
  ],
}).edges({});
