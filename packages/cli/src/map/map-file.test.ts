import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type LoadedWorld, loadWorld } from "../load/load-world.ts";
import { writeMap } from "./map-file.ts";

const EXAMPLE = join(import.meta.dir, "../../../world/example");
const DATA_BLOCK = /<script type="application\/json" id="nuhokai-world">([\s\S]*?)<\/script>/;
const roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nuhokai-map-file-test-"));
  roots.push(dir);
  return dir;
}

/** packages/world/example as a repo's world: imports @nuhokai/world; the compile-time-only file stays out. */
function exampleWorld(): string {
  const root = tempDir();
  mkdirSync(join(root, "nuhokai"));
  for (const file of readdirSync(EXAMPLE)) {
    if (file.endsWith(".test.ts") || file === "type-errors.ts") continue;
    const source = readFileSync(join(EXAMPLE, file), "utf8").replaceAll('"../src/index.ts"', '"@nuhokai/world"');
    writeFileSync(join(root, "nuhokai", file), source);
  }
  return root;
}

/** Every file under `dir`, from `dir`, sorted. */
function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();
}

/** A one-node world whose node has the given purpose. */
function oneNode(purpose: string): LoadedWorld {
  return {
    nodes: [
      {
        schema: "nuhokai/node@1",
        id: "a",
        name: "A",
        parent: null,
        external: false,
        abstract: false,
        purpose,
        status: "planned",
        source: [],
      },
    ],
    placeholders: [],
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("the example world's data block parses back unchanged, and a second write gives the same bytes", async () => {
  const root = exampleWorld();
  const world = await loadWorld(root);
  const before = files(root);

  expect(writeMap(root, world)).toBe("nuhokai/.generated/map.html");
  const html = readFileSync(join(root, "nuhokai/.generated/map.html"), "utf8");
  expect(files(root)).toEqual([...before, "nuhokai/.generated/map.html"].sort());
  expect(JSON.parse(html.match(DATA_BLOCK)?.[1] ?? "")).toEqual(JSON.parse(JSON.stringify(world)));

  writeMap(root, world);
  expect(readFileSync(join(root, "nuhokai/.generated/map.html"), "utf8")).toBe(html);
  expect(html).not.toContain(root);
});

test("a previous map is replaced", () => {
  const root = tempDir();
  mkdirSync(join(root, "nuhokai/.generated"), { recursive: true });
  writeFileSync(join(root, "nuhokai/.generated/map.html"), "old map\n");

  writeMap(root, oneNode("new map"));

  const html = readFileSync(join(root, "nuhokai/.generated/map.html"), "utf8");
  expect(html).toContain('"purpose":"new map"');
  expect(files(root)).toEqual(["nuhokai/.generated/map.html"]);
});

test("a purpose that closes the script stays data", () => {
  const root = tempDir();
  const purpose = "</script><script>alert(1)</script><!-- x";

  writeMap(root, oneNode(purpose));

  const html = readFileSync(join(root, "nuhokai/.generated/map.html"), "utf8");
  const block = html.match(DATA_BLOCK)?.[1] ?? "";
  expect(block).not.toContain("<");
  expect(JSON.parse(block).nodes[0].purpose).toBe(purpose);
  expect(html).not.toContain("alert(1)</script>");
});

test("the map loads nothing: three.js and OrbitControls are inlined with their license headers", () => {
  const root = tempDir();
  writeMap(root, oneNode("offline"));

  const html = readFileSync(join(root, "nuhokai/.generated/map.html"), "utf8");
  expect(html).not.toMatch(/\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i);
  expect(html).not.toMatch(/<script[^>]*\bsrc\s*=/i);
  expect(html).not.toMatch(/<link\b/i);
  expect(html).toContain("Copyright 2010-2021 Three.js Authors");
  expect(html).toContain("three.js r128 examples/js/controls/OrbitControls.js");
  expect(html).not.toContain("/*nuhokai:");
  expect(html).not.toContain('"nuhokai:world"');
  // Only the data block's own closing tag may end it, and every inlined script stays one script.
  expect(html.match(/<\/script/gi)?.length).toBe(html.match(/<script/gi)?.length);
});

test("the write failed: a directory in the map's place is a filesystem error, and nothing else is written", () => {
  const root = tempDir();
  mkdirSync(join(root, "nuhokai/.generated/map.html"), { recursive: true });

  expect(() => writeMap(root, oneNode("blocked"))).toThrow(expect.objectContaining({ code: "EISDIR" }));
  expect(files(root)).toEqual([]);
});
