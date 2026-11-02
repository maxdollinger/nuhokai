import { defineWorld } from "@nuhokai/world";
import { Check } from "./check/check.ts";
import { Cli } from "./cli.ts";
import { Browser } from "./externals/browser.ts";
import { BunRuntime } from "./externals/bun-runtime.ts";
import { FileSystem } from "./externals/file-system.ts";
import { Terminal } from "./externals/terminal.ts";
import { ThreeJs } from "./externals/three-js.ts";
import { Tsgo } from "./externals/tsgo.ts";
import { Failure } from "./failure.ts";
import { Init } from "./init/init.ts";
import { Inspect } from "./inspect.ts";
import { LoadWorld } from "./load-world.ts";
import { WorldMap } from "./map/world-map.ts";
import { Path } from "./path/path.ts";
import { Tree } from "./tree/tree.ts";

/** The package's own world: the loader's only entry point. */
export default defineWorld({
  id: "01a17bb5-b066-71d1-9cc3-aa3378eae8e1",
  name: "@nuhokai/cli",
  description: "The toolchain around the world format: init, map, check and tree.",
  source: ["src/**", "scripts/**"],
  children: [
    Cli,
    Init,
    WorldMap,
    Check,
    Tree,
    Inspect,
    LoadWorld,
    Path,
    Failure,
    Terminal,
    FileSystem,
    BunRuntime,
    Tsgo,
    Browser,
    ThreeJs,
  ],
});
