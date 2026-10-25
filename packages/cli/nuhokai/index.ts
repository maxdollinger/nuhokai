import { defineWorld } from "@nuhokai/world";
import { Cli } from "./cli.ts";

/** The package's own world: the loader's only entry point. */
export default defineWorld({
  children: [Cli],
});
