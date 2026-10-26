import { node } from "@nuhokai/world";
import { WorldPath } from "../world-path.ts";

/** The map page: its bytes, and their replacement in one step. */
export const MapFile = node({
  id: "01a179c9-f7cf-779b-98cd-d973d9c86279",
  purpose:
    "Own the map page: one self-contained HTML document holding the viewer and the loaded world as one data block, " +
    "written to nuhokai/.generated/map.html in one step. Draws whatever world it is given; never loads, checks or " +
    "chooses the directory.",
  status: "planned",
  source: ["packages/cli/src/map/map-file.ts", "packages/cli/src/map/viewer.html"],
  ports: {
    write: {
      kind: "call",
      purpose: "Write the map of the given world",
      input: "the project root and the loaded world: its nodes as NodeSpec and its placeholders",
      output: "the from-root path, nuhokai/.generated/map.html",
      errors: ["the directory is not writable", "the write failed"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Exactly one file, nuhokai/.generated/map.html, creating nuhokai/.generated/ if missing; an existing map is replaced in one rename, so a failure leaves the previous map and no temporary file.",
    },
    {
      id: "R2",
      text: "The page embeds the loaded world unchanged as one JSON data block and reads nothing else: no fetch, no file next to it.",
    },
    {
      id: "R3",
      text: "Spec text cannot leave the data block: <, >, &, U+2028 and U+2029 are escaped, so '</script>' or '<!--' in a purpose renders as text.",
    },
    {
      id: "R4",
      text: "Deterministic: the same world gives identical bytes; no timestamp, root path or random value; the layout is seeded by node ids.",
    },
    {
      id: "R5",
      text: "The page draws the top level as islands; double-click opens a dome, breadcrumbs lead back. Uses edges are lanes labelled with their ports, uses of event ports are air routes, a dome's ports enter through its delegates, groups are reefs, a tbd placeholder is a dashed hole island labelled with its description and joined to each node using it in the open scope, externals stand at the outer edge by externalType (caller, api, db) and status colours an island.",
    },
    {
      id: "R6",
      text: "Clicking a node shows its purpose, status, ports, requirements and source; no field outside MAX-5 is shown or invented.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "The only resources the page loads are three.js r128 and its OrbitControls, pinned, from the CDNs the reference viewer uses.",
    },
  ],
  testCases: [
    {
      text: "Writing the example world gives one file whose data block parses back to the same nodes and placeholders; a second write of the same world gives identical bytes.",
      demonstrates: ["R1", "R2", "R4"],
    },
    {
      text: "A purpose containing </script><script>alert(1)</script> stays inside the data block and parses back unchanged.",
      demonstrates: ["R3"],
    },
    {
      text: "A write into a read-only .generated/ fails with one error and leaves the previous map and no temporary file.",
      demonstrates: ["R1"],
    },
    {
      text: "Opened in a browser, the example world shows its top-level islands, Shop opens to Orders and Stock, Postgres stands at the edge as a db, and notifyCustomer is one hole joined to Orders and Stock.",
      demonstrates: ["R5", "R6"],
    },
  ],
  decisions: [
    {
      decision:
        "The page receives the loaded world unchanged and adapts it to the scene itself; the viewer is a static asset with one data hole.",
      why: "One data contract, MAX-5, from the loader to the browser: the viewer can be developed by pasting any loaded world into it, and no TypeScript mapping drifts from the page's own model.",
      rejected: [
        {
          option: "Map NodeSpec to the viewer's model in TypeScript",
          why: "A second model on both sides of the template, kept in sync by hand.",
        },
        { option: "A JSON file next to the page", why: "file:// pages cannot fetch it; two files to keep together." },
      ],
    },
    {
      decision: "MAX-5 status replaces the reference viewer's complexity as the island's colour; role is dropped.",
      why: "Neither role nor complexity is a node field, and node fields come only from node-spec.ts; status is the one lifecycle fact every node has.",
      rejected: [{ option: "Add role and complexity to the format", why: "A format change for one view." }],
    },
    {
      decision: "three.js is loaded from pinned CDN URLs, not inlined.",
      why: "Keeps the page and the CLI small and the bytes reviewable when committed; viewing a map is not the CLI's run and may use the network.",
      rejected: [
        {
          option: "Inline three.js into every map",
          why: "~600 KB per map and in the binary, for offline viewing nobody asked for yet.",
        },
      ],
    },
  ],
}).edges({ uses: () => [WorldPath.file] });
