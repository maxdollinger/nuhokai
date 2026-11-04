import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { splitReport } from "../shared/split-report.ts";
import { runReviewPrompt } from "./review-prompt.ts";

/** The CLI's own world, named from the cwd as a command names it. */
const ROOT = relative(process.cwd(), join(import.meta.dir, "../..")) || ".";
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** `--path <root>` as a suggested command carries it, unless the root is the cwd. */
const pathArgs = ROOT === "." ? "" : ` --path ${ROOT}`;

test("R1, R2: a reviewable leaf → the prompt, ok; a typo or a dome → one line, invalid; no world → one line, failed", async () => {
  const prompt = splitReport(await runReviewPrompt(ROOT, "Tree/PrintTree"));
  expect(prompt.outcome).toBe("ok");
  expect(prompt.err).toEqual([]);
  expect(prompt.out[0]).toBe("# Review Tree/PrintTree against its spec");
  expect(prompt.out.at(-1)).toContain(`\`nuhokai review --submit${pathArgs}\``);

  expect(splitReport(await runReviewPrompt(ROOT, "Tree/PrintTre"))).toEqual({
    outcome: "invalid",
    out: [],
    err: [`no node 'Tree/PrintTre'; did you mean \`nuhokai tree Tree/PrintTree${pathArgs}\`?`],
  });
  expect(splitReport(await runReviewPrompt(ROOT, "Check"))).toEqual({
    outcome: "invalid",
    out: [],
    err: [`Check is a dome, and a review covers one leaf; \`nuhokai tree Check${pathArgs}\` lists its children`],
  });

  const empty = mkdtempSync(join(tmpdir(), "nuhokai-review-prompt-"));
  temps.push(empty);
  const none = splitReport(await runReviewPrompt(empty, "Tree/PrintTree"), empty);
  expect(none.outcome).toBe("failed");
  expect(none.out).toEqual([]);
  expect(none.err).toHaveLength(1);
  expect(none.err[0]).toStartWith("no nuhokai/ in <root>");
});
