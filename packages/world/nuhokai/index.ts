import { defineWorld } from "../src/index.ts";
import { WorldFormat } from "./world-format.ts";

/** The package's own world: the loader's only entry point. */
export default defineWorld({
  children: [WorldFormat],
});
