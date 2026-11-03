import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadWorld } from "./load/load-world.ts";

const SRC = import.meta.dir;
const PACKAGE = join(SRC, "..");

/** Anything that reaches the terminal or the process's exit: console, the std streams, exit codes, a tty. */
const TERMINAL =
  /\bconsole\.|process\.(stdout|stderr|stdin|exit|exitCode)\b|Bun\.(stdout|stderr|stdin)\b|node:(readline|tty)/;

test("Cli R9: no source file but bin.ts touches the terminal; commands return a Report instead", () => {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .map((path) => path.split("\\").join("/"))
    .filter((path) => path.endsWith(".ts") && path !== "bin.ts")
    .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".gen.ts"));
  expect(files).toContain("check/check-world.ts");
  const offenders = files.filter((path) => TERMINAL.test(readFileSync(join(SRC, path), "utf8")));
  expect(offenders).toEqual([]);
});

test("Cli R9: in the CLI's own world only Cli uses Terminal", async () => {
  const world = await loadWorld(PACKAGE);
  const terminal = world.nodes.find((spec) => spec.name === "Terminal" && spec.external);
  expect(terminal).toBeDefined();
  const users = world.nodes
    .filter((spec) => spec.edges?.some((edge) => edge.kind === "uses" && edge.to === terminal?.id))
    .map((spec) => spec.name);
  expect(users).toEqual(["Cli"]);
});
