import { defineWorld } from "@nuhokai/world";
import { Cli } from "./cli.ts";
import { Init } from "./init.ts";

/** The package's own world: the loader's only entry point. */
export default defineWorld({
  children: [Cli, Init],
});
