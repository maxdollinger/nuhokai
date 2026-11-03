import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LoadedWorld } from "../load/load-world.ts";
import { nameInWorld, WORLD_MAP } from "../shared/paths.ts";
import { SCENE_JS, THREE_JS, VIEWER_HTML } from "../toolchain/map-assets.gen.ts";
import type { MapWorld } from "./scene.js";

/** The viewer's slots, each held exactly once: a comment in a script, the data block's placeholder string. */
const SLOTS = /\/\*nuhokai:(three|scene)\*\/|"nuhokai:(world)"/g;

/** What the map draws of a loaded world: id, name, source, each node's NodeSpec and the placeholders; never paths. */
export function mapWorld(world: LoadedWorld): MapWorld {
  const { id, name, source, nodes, placeholders } = world;
  return {
    id,
    ...(name === undefined ? {} : { name }),
    ...(source === undefined ? {} : { source }),
    nodes: nodes.map((node) => node.spec),
    placeholders,
  };
}

/**
 * The world as the page's one data block, mapWorld's part of it as JSON with every `<` escaped, so no text in it can
 * close the script or open a comment.
 */
function dataBlock(world: LoadedWorld): string {
  return JSON.stringify(mapWorld(world)).replaceAll("<", "\\u003c");
}

/**
 * The map's bytes: the viewer with three.js (OrbitControls included), the scene
 * module and the world inlined. One pass over the viewer, so nothing inlined is read as a
 * slot. Deterministic: no timestamp, no root path, no randomness.
 */
function mapHtml(world: LoadedWorld): string {
  const fills: Record<string, string> = {
    world: dataBlock(world),
    three: THREE_JS,
    scene: SCENE_JS,
  };
  return VIEWER_HTML.replace(SLOTS, (_, script?: string, data?: string) => fills[script ?? data ?? ""] ?? "");
}

/**
 * Write the map of `world` to nuhokai/.generated/map.html under `root`, creating
 * .generated/ and replacing any previous map; touches no other path. Answers the
 * path written, named as `root` names the project directory.
 */
export function writeMap(root: string, world: LoadedWorld): string {
  const file = nameInWorld(root, WORLD_MAP);
  const html = mapHtml(world);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return file;
}
