import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCENE_JS, THREE_JS, VIEWER_HTML } from "../src/toolchain/map-assets.gen.ts";
import { GENERATED_FILE, renderMapAssets, THREE_VERSION } from "./embed-map.ts";

test("the embedded map assets are up to date", async () => {
  expect(readFileSync(GENERATED_FILE, "utf8")).toBe(await renderMapAssets());
});

test("three is pinned exactly, to the release the map inlines", () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));
  expect(manifest.devDependencies.three).toBe(THREE_VERSION);
  expect(THREE_JS).toMatch(/^\/\*\*\n \* @license\n \* Copyright 2010-\d{4} Three\.js Authors/);
  expect(THREE_JS).toContain(`window.__THREE__="${THREE_VERSION.split(".")[1]}"`);
});

test("no inlined asset can end its script or open a comment in the page", () => {
  for (const script of [THREE_JS, SCENE_JS]) {
    expect(script).not.toMatch(/<\/script|<!--|<script/i);
  }
  for (const slot of ['"nuhokai:world"', "/*nuhokai:three*/", "/*nuhokai:scene*/"]) {
    expect(VIEWER_HTML.split(slot)).toHaveLength(2);
  }
});
