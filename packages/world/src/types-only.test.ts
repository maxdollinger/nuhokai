import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// World files are read by tools, never run, so the package is types only: every source file transpiles to nothing
// but the index's re-exports, which world files import as values for tsc.

test("every source file is types only: nothing but re-exports is left after transpiling", () => {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const files = readdirSync(import.meta.dir).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
  expect(files).toContain("node.ts");
  for (const file of files) {
    const code = transpiler.transformSync(readFileSync(join(import.meta.dir, file), "utf8"));
    const statements = code.replace(/export\s*\{[^}]*\}(\s*from\s*"[^"]+")?;?/g, "").trim();
    expect(statements, file).toBe("");
  }
});
