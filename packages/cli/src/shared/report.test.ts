import { expect, test } from "bun:test";
import { CliError } from "./failure.ts";
import { CutShort, collecting, ok, orFailed, resultLine } from "./report.ts";

test("Failure R4: ok of texts is their result lines, in order", () => {
  expect(ok(["a", "b"])).toEqual({
    outcome: "ok",
    lines: [
      { kind: "result", text: "a" },
      { kind: "result", text: "b" },
    ],
  });
});

test("Failure R5: an expected failure is one failure line, failed; a bug is rethrown", async () => {
  const failing = (thrown: unknown) =>
    orFailed(async () => {
      throw thrown;
    });
  expect(await failing(new CliError("no\n  world"))).toEqual({
    outcome: "failed",
    lines: [{ kind: "failure", text: "no world" }],
  });
  const bug = new TypeError("boom");
  await expect(failing(bug)).rejects.toBe(bug);
});

test("Failure R5: a bug escaping a collecting command is a CutShort carrying the lines added before it", async () => {
  const bug = new TypeError("boom");
  const thrown = await collecting(async (lines) => {
    lines.push(resultLine("found"));
    throw bug;
  }).catch((error: unknown) => error);
  expect(thrown).toBeInstanceOf(CutShort);
  expect((thrown as CutShort).bug).toBe(bug);
  expect((thrown as CutShort).lines).toEqual([{ kind: "result", text: "found" }]);
  expect(await collecting(async (lines) => ({ outcome: "ok", lines }))).toEqual({ outcome: "ok", lines: [] });
});
