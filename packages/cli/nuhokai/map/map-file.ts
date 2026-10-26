import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";

/** The map: its bytes, and where they go. */
export const MapFile = node({
  id: "01a179c9-f7cf-779b-98cd-d973d9c86279",
  purpose:
    "Own the map: one self-contained HTML file holding the viewer and the loaded world as one data block, written " +
    "to nuhokai/.generated/map.html. Writes the map of whatever world it is given; never loads, checks or resolves " +
    "the root.",
  status: "planned",
  source: ["packages/cli/src/map/map-file.ts", "packages/cli/src/map/viewer.html", "packages/cli/src/map/scene.js"],
  ports: {
    write: {
      kind: "call",
      purpose: "Write the map of the given world",
      input: "the project root and the loaded world: its nodes as NodeSpec and its tbd placeholders",
      output: "the from-root path, nuhokai/.generated/map.html",
      errors: ["the directory is not writable", "the write failed"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Writes exactly nuhokai/.generated/map.html, creating nuhokai/.generated/ if missing and replacing any previous map.",
    },
    {
      id: "R2",
      text: "The map embeds the loaded world unchanged as one JSON data block in which every < is escaped, so spec text cannot end the script.",
    },
    {
      id: "R3",
      text: "Deterministic: the same world gives identical bytes; no timestamp, root path or random value.",
    },
    {
      id: "R4",
      text: "The viewer draws the top level as islands; double-click opens a dome, breadcrumbs lead back; the same world draws the same layout, seeded by node ids. Uses edges are lanes labelled with their ports, uses of event ports are air routes (an edge listing both kinds is both), implements edges are dashed lanes to the contract, an abstract node is an island marked as a contract, a dome's ports are entries leading to the child they delegate to, groups are pillars, externals stand at the outer edge by externalType (caller, api, db) and an island's colour is its status. A tbd placeholder is a dashed hole labelled with its description. An edge or hole whose user sits inside a dome is drawn from that dome.",
    },
    {
      id: "R5",
      text: "Clicking a node shows its purpose, status, ports, requirements and source; no field outside @nuhokai/world's NodeSpec is shown or invented.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "The map loads nothing: three.js 0.128.0 and its OrbitControls are inlined with their license headers.",
    },
  ],
  testCases: [
    {
      text: "Writing the example world gives one file whose data block parses back to the same nodes and tbd placeholders; a second write of the same world gives identical bytes.",
      demonstrates: ["R1", "R2", "R3"],
    },
    {
      text: "A purpose containing </script><script>alert(1)</script> stays inside the data block and parses back unchanged.",
      demonstrates: ["R2"],
    },
    {
      text: "The written map contains no http(s) URL in a src or href.",
      demonstrates: ["C1"],
    },
    {
      text: "Run under bun on the example world, the scene module draws Stock's Postgres lane and the notifyCustomer hole from Shop at the top level, and from Stock inside Shop.",
      demonstrates: ["R4"],
    },
    {
      text: "Opened in a browser, the example world shows its top-level islands, Postgres stands at the edge as a db and AuditLog as a contract; Shop opens to Orders and Stock; clicking Orders shows its purpose, status, ports, requirements and source, and nothing else.",
      demonstrates: ["R4", "R5"],
    },
  ],
  decisions: [
    {
      decision:
        "viewer.html is the reference archipelago viewer with its hardcoded model replaced by one data slot; scene.js, a plain JS module inlined into it, turns the loaded world into the scene.",
      why: "One data contract, @nuhokai/world's NodeSpec, from the loader to the browser, and the logic-heavy part (lifting edges and holes to their dome, delegates, groups) is unit-tested under bun instead of only by eye.",
      rejected: [
        {
          option: "Map NodeSpec to the viewer's model in TypeScript",
          why: "A second model on both sides of the template, kept in sync by hand.",
        },
        { option: "A JSON file next to the map", why: "file:// pages cannot fetch it; two files to keep together." },
      ],
    },
    {
      decision: "An island's colour is its status.",
      why: "status is the one lifecycle fact every node has, and the map shows only NodeSpec fields.",
      rejected: [
        {
          option: "Colour by role or complexity",
          why: "Neither is a NodeSpec field; adding them is a format change for one view.",
        },
      ],
    },
    {
      decision: "three.js 0.128.0 and OrbitControls are inlined into every map.",
      why: "The CLI promises a toolchain-free repo, and the map keeps that promise when opened: offline and independent of any CDN. Both files are embedded in the CLI at build time from the exactly pinned three dev dependency; ~630 KB per map, and a committed map diffs only in its data block.",
      rejected: [
        {
          option: "Pinned CDN URLs",
          why: "The map breaks offline and depends on a third party staying up and unchanged.",
        },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
