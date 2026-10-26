import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";

/** The map: its bytes and where they go. */
export const MapFile = node({
  id: "01a179c9-f7cf-779b-98cd-d973d9c86279",
  purpose:
    "Own the map: one self-contained HTML file, the viewer plus the loaded world as one data block. Never loads, checks or resolves the root.",
  status: "building",
  source: [
    "packages/cli/src/map/map-file.ts",
    "packages/cli/src/map/viewer.html",
    "packages/cli/src/map/scene.js",
    "packages/cli/src/map/scene.d.ts",
  ],
  ports: {
    write: {
      kind: "call",
      purpose: "Write the map of the given world",
      input: "project root, loaded world",
      output: "nuhokai/.generated/map.html",
      errors: ["the write failed"],
    },
  },
  requirements: [
    { id: "R1", text: "Writes only nuhokai/.generated/map.html; creates .generated/; replaces any previous map." },
    { id: "R2", text: "Loaded world embedded unchanged as one JSON block; every < escaped." },
    { id: "R3", text: "Same world, same bytes: no timestamp, root path or randomness." },
    {
      id: "R4",
      text: "Draws: top level as islands; double-click opens a dome, breadcrumbs back; layout seeded by ids. uses: lanes labelled with ports; event ports: air routes. implements: dashed lane to the contract; abstract: contract island. Dome ports: entries to their delegate. group: pillars. externals: outer edge by externalType. status: island colour. tbd: dashed hole with its description. Edges and holes from inside a dome start at that dome. Moved islands and outer items persist per browser by node id and scope; a regenerated map reuses them; Reset layout forgets them.",
    },
    { id: "R5", text: "Click: purpose, status, ports, requirements, source; NodeSpec fields only." },
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
    {
      text: "scene.js under bun, example world: Stock's Postgres lane and the notifyCustomer hole start at Shop on top, at Stock inside Shop.",
      demonstrates: ["R4"],
    },
    {
      text: "Browser, example world: Postgres at the edge as db, AuditLog as contract, Shop opens to Orders and Stock, clicking Orders shows its fields only.",
      demonstrates: ["R4", "R5"],
    },
    {
      text: "Browser, example world, checked by hand in headless Chromium: a moved Shop keeps its place after a reload and after regenerating with a node added, which is seeded; Reset layout seeds again; without storage the map still draws.",
      demonstrates: ["R3", "R4"],
    },
  ],
  decisions: [
    {
      decision:
        "viewer.html = the reference archipelago viewer with one data slot; scene.js, inlined, turns NodeSpecs into the scene.",
      why: "One data contract from loader to browser; the scene logic is unit-tested under bun.",
    },
    { decision: "Island colour = status.", why: "The one lifecycle field every node has." },
    {
      decision: "Moved positions live in the browser's localStorage, keyed by node id, never in the map.",
      why: "Same world, same bytes; node ids survive a regenerated map, positions in the file would not.",
    },
    {
      decision: "three.js inlined, embedded at build time from the exactly pinned three dev dependency.",
      why: "The map opens offline, like the CLI needs no toolchain; ~630 KB per map.",
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
