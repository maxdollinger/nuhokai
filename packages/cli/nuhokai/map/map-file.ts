import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";
import { Viewer } from "./viewer.ts";

/** The map file: its bytes and where they go; the drawing is Viewer's. */
export const MapFile = node({
  id: "01a179c9-f7cf-779b-98cd-d973d9c86279",
  purpose:
    "Own the map file: the Viewer's page with the loaded world as its one data block and three.js inlined, written to one path. Never loads, checks, draws or picks the project directory.",
  status: "building",
  source: ["packages/cli/src/map/map-file.ts", "packages/cli/scripts/embed-map.ts"],
  ports: {
    write: {
      kind: "call",
      purpose: "Write the map of the given world",
      input: "the project directory named from the cwd, loaded world",
      output: "the map's path named from the cwd: nuhokai/.generated/map.html under the project directory",
      errors: ["the write failed"],
    },
  },
  requirements: [
    { id: "R1", text: "Writes only nuhokai/.generated/map.html; creates .generated/; replaces any previous map." },
    { id: "R2", text: "Loaded world embedded unchanged as one JSON block; every < escaped." },
    { id: "R3", text: "Same world, same bytes: no timestamp, project directory path or randomness." },
    {
      id: "C1",
      kind: "constraint",
      text: "Loads nothing: three.js 0.128.0 and OrbitControls inlined, license headers kept.",
    },
  ],
  testCases: [
    {
      text: "Example world: data block parses back unchanged; a second write gives identical bytes.",
      demonstrates: ["R1", "R2", "R3"],
    },
    { text: "A purpose with </script><script>alert(1)</script> stays data.", demonstrates: ["R2"] },
    { text: "No http(s) URL in any src or href.", demonstrates: ["C1"] },
  ],
  decisions: [
    {
      decision: "three.js inlined, embedded at build time from the exactly pinned three dev dependency.",
      why: "The map opens offline, like the CLI needs no toolchain; ~630 KB per map.",
    },
  ],
}).edges({ uses: () => [WorldPath.file, Viewer.page] });
