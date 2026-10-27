import { defineWorld } from "@nuhokai/world";
import { Cli } from "./cli.ts";
import { Failure } from "./failure.ts";
import { Init } from "./init/init.ts";
import { Inspect } from "./inspect.ts";
import { LoadWorld } from "./load-world.ts";
import { WorldMap } from "./map/world-map.ts";
import { New } from "./new/new.ts";
import { WorldPath } from "./world-path.ts";

/** The package's own world: the loader's only entry point. */
export default defineWorld({
  id: "01a17bb5-b066-71d1-9cc3-aa3378eae8e1",
  children: [Cli, Init, New, WorldMap, Inspect, LoadWorld, WorldPath, Failure],
});
