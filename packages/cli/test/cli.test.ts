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

test("the package's own world is Cli plus the Init dome", () => {
  expect(cliWorld.$ref).toBe("world");
  const [cli, dome] = cliWorld.children as unknown as readonly {
    $ref: string;
    parent?: unknown;
    children?: readonly unknown[];
  }[];
  expect(cli).toBe(Cli);
  expect(dome?.$ref).toBe("relation");
  expect(dome?.parent).toBe(Init);
  expect(dome?.children).toHaveLength(6);
  expect(dome?.children).toContain(Scaffold);
});

test("Init delegates its run port to Scaffold", () => {
  expect(Init.$ref).toBe("node");
  expect(Init.$def.ports?.run?.kind).toBe("call");
  expect(Init.$def.status).toBe("planned");
  expect(Init.$def.delegate?.run?.()).toBe(Scaffold.run);
});
