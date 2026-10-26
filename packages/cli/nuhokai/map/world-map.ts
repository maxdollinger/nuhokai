import { node } from "@nuhokai/world";
import { DrawMap } from "./draw-map.ts";
import { MapFile } from "./map-file.ts";

/**
 * The map boundary: `nuhokai map` draws the world as one HTML page.
 * Inside: DrawMap (program) and MapFile (the page).
 * LoadWorld, ResolveTarget, Inspect, WorldPath and Failure are shared top-level nodes.
 */
export const WorldMap = node({
  id: "01a179c9-f7d4-7081-ad93-92211b3fe333",
  purpose:
    "Draw the current world as a map: islands, domes, ports and edges in one self-contained HTML page at " +
    "nuhokai/.generated/map.html. Reads the world as it evaluates; never checks, edits or opens a browser. " +
    "run delegates to DrawMap.",
  status: "planned",
  source: ["packages/cli/src/map/**"],
  requirements: [
    {
      id: "R1",
      text: "Writes exactly nuhokai/.generated/map.html, replacing the previous map; no authored file, tsconfig or .generated/world/ changes.",
    },
    {
      id: "R2",
      text: "stdout: the from-root path; a failure: one stderr line, no stdout, the previous map unchanged.",
    },
    {
      id: "R3",
      text: "Draws what evaluates, unchecked: a world that check rejects still gets a map, as long as it loads.",
    },
    { id: "R4", text: "The same world gives identical bytes, so a committed map changes only with the world." },
    { id: "C1", kind: "constraint", text: "No arguments; --help is the only flag." },
  ],
  testCases: [
    {
      text: "After init, map writes nuhokai/.generated/map.html, prints its path and exits 0; a second run gives identical bytes and changes no other file.",
      demonstrates: ["R1", "R2", "R4"],
    },
    {
      text: "A world with an orphan and a duplicate id still gets a map; a world that does not evaluate gets one stderr line, exit 1.",
      demonstrates: ["R2", "R3"],
    },
  ],
  decisions: [
    {
      decision: "The command is `nuhokai map`.",
      why: "The domain already calls this picture the map (islands and domes, groups as pillars, externals at the map's outer edge), and every command is one verb of the domain: init, new, check, update, map.",
      rejected: [
        {
          option: "gen-world",
          why: "Two words where every command has one; 'gen' names the mechanism and 'world' the input, not what the user gets.",
        },
        { option: "view or open", why: "Promise a browser window; the command only writes a file." },
        { option: "render, draw or export", why: "Generic verbs that say nothing about the result." },
      ],
    },
    {
      decision: "The dome is WorldMap, its program DrawMap and its page MapFile.",
      why: "Same cut as New (AddNode, NodeFile): a program plus one file owner. 'Map' alone would shadow the global Map in every file that imports it.",
      rejected: [{ option: "Map", why: "Shadows the JavaScript built-in." }],
    },
    {
      decision: "map loads and draws without running check.",
      why: "A broken world is when a map helps most, and check stays the one gate; map only needs the world to evaluate.",
      rejected: [
        { option: "Refuse worlds check rejects", why: "Couples two commands and hides the map when it is needed." },
      ],
    },
    {
      decision: "The page lives at nuhokai/.generated/map.html.",
      why: "Everything the CLI owns sits in the one world folder, and .generated/ already holds what the CLI regenerates; whether to commit it is the repo's choice, and determinism keeps either clean.",
      rejected: [
        { option: "A file outside nuhokai/ (dist/, the repo root)", why: "A second root for CLI-owned paths." },
        {
          option: "A temp file opened in the browser",
          why: "Not reproducible, not linkable, and useless in CI.",
        },
      ],
    },
  ],
  children: { drawMap: DrawMap, mapFile: MapFile },
  ports: (c) => ({ run: c.drawMap.ports.run }),
}).edges({});
