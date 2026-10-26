import { node } from "@nuhokai/world";
import { DrawMap } from "./draw-map.ts";
import { MapFile } from "./map-file.ts";

/** `nuhokai map`: the world as one HTML file. Inside: DrawMap (program), MapFile (the map). */
export const WorldMap = node({
  id: "01a179c9-f7d4-7081-ad93-92211b3fe333",
  purpose:
    "Draw the current world (islands, domes, ports, edges, tbd placeholders) into nuhokai/.generated/map.html. Never checks, edits or opens a browser.",
  status: "building",
  source: ["packages/cli/src/map/**"],
  requirements: [
    { id: "R1", text: "Writes only nuhokai/.generated/map.html." },
    { id: "R2", text: "stdout: the from-root path. Failure: one stderr line; a load failure keeps the previous map." },
    { id: "R3", text: "Unchecked: any world that loads gets a map." },
    { id: "C1", kind: "constraint", text: "No arguments; --help only." },
  ],
  testCases: [
    {
      text: "After init: writes and prints nuhokai/.generated/map.html, exit 0; a second run changes no other file.",
      demonstrates: ["R1", "R2"],
    },
    { text: "A world with an orphan and an out-of-scope uses edge still gets a map.", demonstrates: ["R3"] },
  ],
  decisions: [
    {
      decision: "Command `nuhokai map`.",
      why: "The domain calls this picture the map; every command is one word.",
    },
    { decision: "No check before drawing.", why: "A broken world is when the map helps most." },
    {
      decision: "Output in nuhokai/.generated/.",
      why: "The CLI owns only nuhokai/; .generated/ holds what it regenerates. Committing is the repo's choice.",
    },
  ],
  children: { drawMap: DrawMap, mapFile: MapFile },
  ports: (c) => ({ run: c.drawMap.ports.run }),
}).edges({});
