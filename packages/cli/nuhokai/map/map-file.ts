import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";

/** The map: its bytes, and their replacement in one step. */
export const MapFile = node({
  id: "01a179c9-f7cf-779b-98cd-d973d9c86279",
  purpose:
    "Own the map: one self-contained HTML file holding the viewer and the loaded world as one data block, written " +
    "to nuhokai/.generated/map.html in one step. Writes the map of whatever world it is given; never loads, checks " +
    "or resolves the root.",
  status: "planned",
  source: ["packages/cli/src/map/map-file.ts", "packages/cli/src/map/viewer.html"],
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
      text: "Exactly one file, nuhokai/.generated/map.html, creating nuhokai/.generated/ if missing; an existing map is replaced by one rename from a temporary file beside it, so a failure leaves the previous map and no temporary file.",
    },
    { id: "R2", text: "The map embeds the loaded world unchanged as one JSON data block." },
    {
      id: "R3",
      text: "Spec text cannot leave the data block: <, >, &, U+2028 and U+2029 are escaped, so '</script>' or '<!--' in a purpose renders as text.",
    },
    {
      id: "R4",
      text: "Deterministic: the same world gives identical bytes; no timestamp, root path or random value.",
    },
    {
      id: "R5",
      text: "The viewer draws the top level as islands; double-click opens a dome, breadcrumbs lead back; the same world draws the same layout, seeded by node ids. Uses edges are lanes labelled with their ports, uses of event ports are air routes, implements edges are dashed lanes to the contract, an abstract node is an island marked as a contract, a dome's ports are entries leading to the child they delegate to, groups are pillars, externals stand at the outer edge by externalType (caller, api, db) and an island's colour is its status. A tbd placeholder is a dashed hole labelled with its description and joined to each user; where a user sits inside a dome, the hole joins that dome.",
    },
    {
      id: "R6",
      text: "Clicking a node shows its purpose, status, ports, requirements and source; no field outside @nuhokai/world's NodeSpec is shown or invented.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "The map loads nothing: three.js 0.128.0 and its OrbitControls are inlined with their license headers, embedded in the CLI at build time from the exactly pinned three dev dependency; the repo and the opened map need no network, Node or Bun.",
    },
  ],
  testCases: [
    {
      text: "Writing the example world gives one file whose data block parses back to the same nodes and tbd placeholders; a second write of the same world gives identical bytes.",
      demonstrates: ["R1", "R2", "R4"],
    },
    {
      text: "A purpose containing </script><script>alert(1)</script> stays inside the data block and parses back unchanged.",
      demonstrates: ["R3"],
    },
    {
      text: "The written map contains no http(s) URL in a src or href, and opens with the network disabled.",
      demonstrates: ["C1"],
    },
    {
      text: "A write into a read-only .generated/ fails with one error and leaves the previous map and no temporary file.",
      demonstrates: ["R1"],
    },
    {
      text: "Opened in a browser, the example world shows its top-level islands, Postgres stands at the edge as a db and notifyCustomer is one hole joined to Shop; Shop opens to Orders and Stock, both joined to that hole; clicking Orders shows its purpose, status, ports, requirements and source, and nothing else.",
      demonstrates: ["R5", "R6"],
    },
  ],
  decisions: [
    {
      decision:
        "The viewer receives the loaded world unchanged and adapts it to the scene itself; it is a static template with one data slot.",
      why: "One data contract, @nuhokai/world's NodeSpec, from the loader to the browser: the viewer can be developed by pasting any loaded world into it, and no TypeScript mapping drifts from the viewer's own model.",
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
      decision: "three.js 0.128.0 and OrbitControls are inlined into every map, embedded in the CLI at build time.",
      why: "The CLI promises a toolchain-free repo, and the map keeps that promise when opened: offline, air-gapped and independent of any CDN. The cost is ~630 KB per map and in a binary that already carries the Bun runtime; a committed map diffs only in its data block, because the library is one unchanged line.",
      rejected: [
        {
          option: "Pinned CDN URLs",
          why: "The map breaks offline and depends on a third party staying up and unchanged.",
        },
        {
          option: "Vendor the files into the repo",
          why: "A pinned dev dependency gives the same bytes without a copy to maintain.",
        },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
