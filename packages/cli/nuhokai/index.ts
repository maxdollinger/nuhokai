import { defineWorld, relation } from "@nuhokai/world";
import { Cli } from "./cli.ts";
import { CliFiles } from "./cli-files.ts";
import { ExampleWorld } from "./example-world.ts";
import { Init } from "./init.ts";
import { Inspect } from "./inspect.ts";
import { Publish } from "./publish.ts";
import { ResolveTarget } from "./resolve-target.ts";
import { Scaffold } from "./scaffold.ts";

/**
 * The package's own world: the loader's only entry point.
 * Init is a dome: the command boundary outside, the program and its domains inside.
 */
export default defineWorld({
  children: [
    Cli,
    relation({
      parent: Init,
      children: [Scaffold, ResolveTarget, Inspect, Publish, ExampleWorld, CliFiles],
    }),
  ],
});
