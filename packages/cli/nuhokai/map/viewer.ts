import { node } from "@nuhokai/world";

/** The map's page: what the browser draws from the loaded world. */
export const Viewer = node({
  id: "01a17bb5-b066-71d0-a81d-ccdfa4cb5fde",
  purpose:
    "Own the drawing: the page that turns the loaded world into islands, domes, lanes and holes in the browser. Never writes files, inlines assets or picks where the map goes.",
  status: "building",
  source: ["packages/cli/src/map/viewer.html", "packages/cli/src/map/scene.js", "packages/cli/src/map/scene.d.ts"],
  ports: {
    page: {
      kind: "call",
      purpose: "Draw the loaded world in the browser",
      input: "the loaded world, its id, NodeSpecs and tbd placeholders, as JSON in the page's one data block",
      output: "the drawn page: islands per scope, edges, holes, saved layout, click details",
    },
  },
  requirements: [
    { id: "R1", text: "Top level: top-level nodes as islands. A dome: its direct children as islands." },
    { id: "R2", text: "Double-click opens a dome; breadcrumbs lead back." },
    {
      id: "R3",
      text: "uses: lanes labelled with their ports; event ports: air routes from the publisher. An edge from inside a dome starts at that dome.",
    },
    { id: "R4", text: "implements: dashed lane to the contract; abstract: contract island." },
    { id: "R5", text: "Dome ports: entries to their delegate. group: pillars. externals: outer edge by externalType." },
    { id: "R6", text: "status: island colour." },
    { id: "R7", text: "tbd: dashed hole with its description; from inside a dome it starts at that dome." },
    {
      id: "R8",
      text: "Layout seeded by ids. Moved islands and outer items persist per browser under nuhokai.map.layout.<world id>, by scope (the world's or a dome's id) and node id; a regenerated map reuses them; a scope drops saved items it no longer draws; Reset layout forgets the scope's.",
    },
    { id: "R9", text: "Click: purpose, status, ports, requirements, source; NodeSpec fields only." },
  ],
  testCases: [
    {
      text: "scene.js under bun, example world: Stock's Postgres lane and the notifyCustomer hole start at Shop on top, at Stock inside Shop.",
      demonstrates: ["R3", "R7"],
    },
    {
      text: "By hand: in a browser, example world, Postgres at the edge as db, AuditLog as contract, Shop opens to Orders and Stock, clicking Orders shows its fields only.",
      demonstrates: ["R1", "R2", "R4", "R5", "R9"],
    },
    {
      text: "By hand: in headless Chromium, example world, a moved Shop keeps its place after a reload and after regenerating with a node added, which is seeded; Reset layout seeds again; without storage the map still draws.",
      demonstrates: ["R8"],
    },
    {
      text: "By hand: in headless Chromium, the maps of two worlds from file:// keep their moved islands apart, each under its own world id.",
      demonstrates: ["R8"],
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
      decision:
        "Moved positions live in the browser's localStorage, one entry per world id, inside it by scope and node id; never in the map.",
      why: "Same world, same bytes; ids survive a regenerated map, positions in the file would not. Every file:// page shares one storage, so the world id keeps projects apart.",
    },
  ],
}).edges({});
