import { expect, test } from "bun:test";
import { Cli } from "./cli.ts";
import cliWorld from "./index.ts";
import { Init } from "./init.ts";
import { Scaffold } from "./scaffold.ts";

test("the package's own world lists Cli and the Init dome at the top level", () => {
  expect(cliWorld.$ref).toBe("world");
  expect(cliWorld.children).toEqual([Cli, Init]);
});

test("Init is a dome with its interior as children and delegates run to Scaffold", () => {
  expect(Init.$ref).toBe("node");
  expect(Init.$def.status).toBe("built");
  expect(Object.keys(Init.$def.children ?? {})).toHaveLength(6);
  expect(Init.$def.children?.scaffold).toBe(Scaffold);
  expect(Init.$def.ports?.run).toMatchObject({
    kind: "call",
    delegate: { to: Scaffold.$def.id, port: "run" },
  });
  expect(Init.$def.uses).toBeUndefined();
});
