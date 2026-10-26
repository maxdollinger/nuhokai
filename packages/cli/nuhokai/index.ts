import { defineWorld } from "@nuhokai/world";
import { Cli } from "./cli.ts";
import { Failure } from "./failure.ts";
import { Init } from "./init/init.ts";
import { Inspect } from "./inspect.ts";
import { New } from "./new/new.ts";
import { ResolveTarget } from "./resolve-target.ts";
import { WorldPath } from "./world-path.ts";

/** The package's own world: the loader's only entry point. */
export default defineWorld({
  children: [Cli, Init, New, ResolveTarget, Inspect, WorldPath, Failure],
});
