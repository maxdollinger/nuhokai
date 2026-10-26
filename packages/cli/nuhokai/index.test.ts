import { expect, test } from "bun:test";
import { Cli } from "./cli.ts";
import { Failure } from "./failure.ts";
import cliWorld from "./index.ts";
import { Init } from "./init/init.ts";
import { Scaffold } from "./init/scaffold.ts";
import { Inspect } from "./inspect.ts";
import { AddNode } from "./new/add-node.ts";
import { New } from "./new/new.ts";
import { NodeFile } from "./new/node-file.ts";
import { ResolveTarget } from "./resolve-target.ts";
import { WorldPath } from "./world-path.ts";

test("the package's own world lists Cli, the commands and the shared nodes at the top level", () => {
  expect(cliWorld.$ref).toBe("world");
  expect(cliWorld.children).toEqual([Cli, Init, New, ResolveTarget, Inspect, WorldPath, Failure]);
});

test("the shared nodes are leaves that name their own code", () => {
  for (const shared of [ResolveTarget, Inspect, WorldPath, Failure]) {
    expect(shared.$ref).toBe("node");
    expect(shared.$def.children).toBeUndefined();
    expect(shared.$def.uses).toBeUndefined();
    expect(shared.$def.source.length).toBeGreaterThan(0);
  }
  expect(Object.keys(WorldPath.$def.ports ?? {})).toEqual(["file"]);
  expect(Object.keys(Failure.$def.ports ?? {})).toEqual(["format"]);
});

test("Init is a dome with its interior as children and delegates run to Scaffold", () => {
  expect(Init.$ref).toBe("node");
  expect(Init.$def.status).toBe("built");
  expect(Object.keys(Init.$def.children ?? {})).toHaveLength(4);
  expect(Init.$def.children?.scaffold).toBe(Scaffold);
  expect(Init.$def.children?.resolveTarget).toBeUndefined();
  expect(Init.$def.children?.inspect).toBeUndefined();
  expect(Init.$def.ports?.run).toMatchObject({
    kind: "call",
    delegate: { to: Scaffold.$def.id, port: "run" },
  });
  expect(Init.$def.uses).toBeUndefined();
});

test("New is a dome with its interior as children and delegates run to AddNode", () => {
  expect(New.$ref).toBe("node");
  expect(New.$def.status).toBe("planned");
  expect(Object.keys(New.$def.children ?? {})).toEqual(["addNode", "nodeFile"]);
  expect(New.$def.children?.addNode).toBe(AddNode);
  expect(New.$def.children?.nodeFile).toBe(NodeFile);
  expect(New.$def.ports?.run).toMatchObject({
    kind: "call",
    delegate: { to: AddNode.$def.id, port: "run" },
  });
  expect(New.$def.uses).toBeUndefined();
  expect(AddNode.$def.uses?.()).toEqual([
    ResolveTarget.resolve,
    Inspect.inspect,
    WorldPath.file,
    NodeFile.create,
    Failure.format,
  ]);
});

test("New's interior is a program plus one node file, with no shared code of its own", () => {
  expect(AddNode.$def.uses?.().length).toBe(5);
  expect(NodeFile.$def.uses).toBeUndefined();
  expect(Object.keys(NodeFile.$def.ports ?? {})).toEqual(["create"]);
});
