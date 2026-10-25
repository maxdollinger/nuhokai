import { expect, test } from "bun:test";
import { Cli } from "../nuhokai/cli.ts";
import cliWorld from "../nuhokai/index.ts";
import { COMMANDS, main, usage } from "../src/index.ts";

test("usage lists every command", () => {
  for (const command of COMMANDS) expect(usage()).toContain(command);
});

test("--help exits 0", async () => {
  expect(await main(["--help"])).toBe(0);
});

test("an unknown command is a usage error", async () => {
  expect(await main(["bogus"])).toBe(2);
});

test("the package's own world lists Cli at the top level", () => {
  expect(cliWorld.$ref).toBe("world");
  expect(cliWorld.children).toEqual([Cli]);
});
