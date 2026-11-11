import { expect, test } from "bun:test";
import { readTscError, shortType } from "./tsc-message.ts";

const SETUP_FIX =
  "remove the code that uses it: world files hold data only (do not edit nuhokai/tsconfig.json, it is CLI-owned)";

test("shortType: a generic is its name; an object type intersected onto it goes", () => {
  expect(shortType('NodeShape<undefined, {}, "x">')).toBe("NodeShape");
  expect(shortType("NodeShape<undefined, {}> & { readonly ports?: {}; }")).toBe("NodeShape");
});

test("shortType: a transparent generic is its argument; a Forbidden keeps its message", () => {
  expect(shortType('Readonly<NodeHandle<"a">>')).toBe("NodeHandle");
  expect(shortType('NoInfer<Forbidden<"a draft is not a node">>')).toBe('Forbidden<"a draft is not a node">');
});

test("shortType: a type tsc cut off mid-literal keeps its name and that it goes on", () => {
  expect(shortType('NodeHandle<"01a...')).toBe("NodeHandle<…>");
});

test("readTscError: an error about a Forbidden<…> is its message alone", () => {
  const message = `Type 'NodeDraft<"x">' is not assignable to type 'NoInfer<Forbidden<"a draft is not a node: call .edges(), also with {}">>'.`;
  expect(readTscError([message])).toEqual({
    rule: "a draft is not a node: call .edges(), also with {}",
  });
});

test("readTscError: other types are cut to their names; the reader's long literal is { … }", () => {
  expect(
    readTscError([
      "Object literal may only specify known properties, but 'purpos' does not exist in type 'NodeShape<undefined, {}>'. Did you mean to write 'purpose'?",
    ]),
  ).toEqual({
    rule: "Object literal may only specify known properties, but 'purpos' does not exist in type 'NodeShape'. Did you mean to write 'purpose'?",
  });
  expect(
    readTscError([
      `Argument of type '{ id: string; purpose: string; status: "planned"; source: never[]; extra: number; }' is not assignable to parameter of type 'NodeShape<undefined, {}>'.`,
    ]),
  ).toEqual({ rule: "Argument of type '{ … }' is not assignable to parameter of type 'NodeShape'." });
});

test("readTscError: a quote inside a string literal type ends no type", () => {
  const message = `Type '"the user's"' is not assignable to type 'number'.`;
  expect(readTscError([message])).toEqual({ rule: message });
});

test("readTscError: tsc's advice to change the library gives way to the world's fix", () => {
  expect(
    readTscError([
      "Cannot find name 'console'. Do you need to change your target library? Try changing the 'lib' compiler option to include 'dom'.",
    ]),
  ).toEqual({ rule: "Cannot find name 'console'", fix: SETUP_FIX });
});
