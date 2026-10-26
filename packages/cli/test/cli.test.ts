import { expect, test } from "bun:test";
import { Cli } from "../nuhokai/cli.ts";
import cliWorld from "../nuhokai/index.ts";
import { Init } from "../nuhokai/init.ts";
import { Scaffold } from "../nuhokai/scaffold.ts";
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

test("the package's own world lists Cli and the Init dome at the top level", () => {
  expect(cliWorld.$ref).toBe("world");
  expect(cliWorld.children).toEqual([Cli, Init]);
});

test("Init is a dome with its interior as children and delegates run to Scaffold", () => {
  expect(Init.$ref).toBe("node");
  expect(Init.$def.status).toBe("planned");
  expect(Object.keys(Init.$def.children ?? {})).toHaveLength(6);
  expect(Init.$def.children?.scaffold).toBe(Scaffold);
  expect(Init.$def.ports?.run).toMatchObject({
    kind: "call",
    delegate: { to: Scaffold.$def.id, port: "run" },
  });
  expect(Init.$def.uses).toBeUndefined();
});
