import { defineWorld } from "@nuhokai/world";
import { WorldFormat } from "./world-format.ts";

/** The package's own world: the loader's only entry point. */
export default defineWorld({
  id: "01a17bb5-b066-71d2-a4e5-92ab5b240066",
  name: "@nuhokai/world",
  description: "The world format: nodes, edges and worlds as typed TypeScript.",
  source: ["src/**"],
  children: [WorldFormat],
});
