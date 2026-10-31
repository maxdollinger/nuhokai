import { node } from "@nuhokai/world";

/** The map's page: what the browser draws from the loaded world. */
export const Viewer = node({
  id: "01a17bb5-b066-71d0-a81d-ccdfa4cb5fde",
  purpose:
    "Own the drawing: the page turning the loaded world into islands, domes, lanes and holes in the browser. Never writes files, inlines assets or picks where the map goes.",
  status: "building",
  source: ["src/map/viewer.html", "src/map/scene.js", "src/map/scene.d.ts"],
  ports: {
    page: {
      kind: "call",
      purpose: "Draw the loaded world in the browser",
      input: "LoadWorld.load's id, name, source, nodes and placeholders as JSON in the page's one data block",
      output: "the drawn page: islands per scope, edges, holes, saved layout, click details, search",
    },
  },
  requirements: [
    { id: "R1", text: "Top level: top-level nodes as islands. A dome: its direct children as islands." },
    {
      id: "R2",
      text: "Double-click opens a dome; breadcrumbs lead back. The top level, first breadcrumb and page title carry the world's name, else World.",
    },
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
      text: "Layout seeded by ids. Moved islands and outer items persist per browser under nuhokai.map.layout.<world id>, by scope (the world's or a dome's id) and node id, a tbd hole by its description and sorted user ids; a regenerated map reuses them; a scope drops saved items it no longer draws; Reset layout forgets the scope's.",
    },
    { id: "R9", text: "Click: purpose, status, ports, requirements, source; NodeSpec fields only." },
    { id: "R10", text: "The mouse wheel zooms toward the point under the cursor." },
    {
      id: "R11",
      text: "Search (/ or Ctrl/⌘K, not hinted on touch screens): every node and port by name, every tbd hole by description, whatever scope is open. Case-insensitive tiers: exact, prefix, word starts, substring, subsequence (3+ characters, tighter first); a hole: word starts only as one run, no subsequence; with a separator (space . › /) a port also by its node's name before the last one and its own after, at the worse tier; ties: nodes, holes, ports, then world order. Results: matches bold, holes on up to two lines, the home scope's breadcrumbs, past 50 a `50 of N — keep typing` row, at most 35% of a phone's height; arrows, Enter or click, Escape; keys typed in the box never go up.",
    },
    {
      id: "R12",
      text: "A query lights what stands for each hit in the open scope (the item, its dome or outside proxy; a port's node; the open dome's entry for it and its ports), subsequence hits only if none matches better, and dims the rest harder than hover or selection, lit labels tinted. A click on the map clears it.",
    },
    {
      id: "R13",
      text: "Enter or click lands in the hit's home scope (a node's parent, a port's node's parent, a hole's deepest scope holding all its users), centred: a node selected; a port's node selected, the port's row marked and in view; a hole lit as on hover until the next click, Escape or scope change. / or Ctrl/⌘K on an empty box brings back the query a jump or map click cleared, selected.",
    },
  ],
  testCases: [
    {
      text: "scene.js under bun, example world: Stock's Postgres lane and notifyCustomer hole start at Shop on top, at Stock inside Shop.",
      demonstrates: ["R3", "R7"],
    },
    {
      text: "By hand, browser, example world: Postgres at the edge as db, AuditLog as contract, Shop opens to Orders and Stock, clicking Orders shows its fields only.",
      demonstrates: ["R1", "R2", "R4", "R5", "R9"],
    },
    {
      text: "By hand, headless Chromium, example world: moved Shop keeps its place after reload and after regenerating with a node added (seeded); Reset layout seeds again; without storage the map still draws.",
      demonstrates: ["R8"],
    },
    {
      text: "By hand, headless Chromium: maps of two worlds from file:// keep moved islands apart, each under its world id.",
      demonstrates: ["R8"],
    },
    {
      text: "scene.js under bun: the example world's top level and first breadcrumb are Shop, its name; a world without a name or with a blank one → World.",
      demonstrates: ["R2"],
    },
    {
      text: "scene.js under bun: a node without source (world files are not type-checked) → empty Source section, no crash.",
      demonstrates: ["R9"],
    },
    {
      text: "scene.js under bun: two tbd placeholders with one description in one scope → two holes, each with its sorted user ids, so their saved positions stay apart.",
      demonstrates: ["R7", "R8"],
    },
    {
      text: "By hand, headless Chromium: wheel over an island → it stays under the cursor while the map zooms.",
      demonstrates: ["R10"],
    },
    {
      text: "scene.js under bun, example world: `or` → Orders, Shop › orderHistory, the hole, Shop › placeOrder, AuditLog › history; `ore` → tighter subsequences first; `hist` skips the hole; `pg` and blank → none; holes: `cust`, `a cust` word starts, `ustom` substring, `op` none, `to` substring.",
      demonstrates: ["R11"],
    },
    {
      text: "scene.js under bun: Stock lands in Shop, Shop on top, Stock › reserve on Stock, port reserve; the hole once in Shop; a hole used on top and inside a dome → top.",
      demonstrates: ["R13"],
    },
    {
      text: "scene.js under bun, example world: on top, stock and reserve light Shop; inside Shop, audit lights its outside proxy, shop and placeOrder light the entry.",
      demonstrates: ["R12"],
    },
    {
      text: "By hand, headless Chromium, example world: on top, / then Stock and Enter → Shop open, Stock selected; Backspace and Escape in the box stay in Shop.",
      demonstrates: ["R11", "R13"],
    },
    {
      text: "scene.js under bun, example world: `stock.reserve`, `Stock reserve`, `Stock › reserve`, `stock/reserve` → Stock › reserve, both names bold; `shop place` → Shop › placeOrder alone; `o place` → Orders › place before Shop › placeOrder (substring node); `audit log` → AuditLog; `stock.` → Stock.",
      demonstrates: ["R11"],
    },
    {
      text: "scene.js under bun, example world: `dit` lights AuditLog, not Shop on top nor the entry inside Shop for its subsequence hit orderHistory; `ore`, only subsequences, lights Shop and Postgres.",
      demonstrates: ["R12"],
    },
    {
      text: "By hand, headless Chromium, example world: `customer` + Enter → Shop open, the hole and its lanes lit, plain after a click; `reserve` + Enter → reserve marked in Stock's details, then / brings `reserve` back selected; a click on Shop while `stock` is typed clears the query and selects Shop; `stock` dims the rest harder than hover, Shop's label tinted.",
      demonstrates: ["R12", "R13"],
    },
    {
      text: "By hand, headless Chromium, 132-node world: `run` → 50 rows and `50 of N — keep typing`; `retention` → its hole on two lines with the match shown; 390px with touch: list within 35% of the height, placeholder Search, no `/ to search`.",
      demonstrates: ["R11"],
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
      decision: "Islands are discs, their children on concentric rings.",
      why: "The board, the ring the outer items sit on and the spacing between items are all round.",
    },
    {
      decision: "Colour management off, linear output, light intensities ×π.",
      why: "Keeps the palette as three.js r128 drew it; newer three.js converts hex colours from sRGB and uses physical light units.",
    },
    {
      decision:
        "Moved positions live in the browser's localStorage, one entry per world id, inside it by scope and node id; never in the map.",
      why: "Same world, same bytes; ids survive a regenerated map, positions in the file would not. All file:// pages share one storage, so the world id keeps projects apart.",
    },
    {
      decision: "Search: a hand-written tiered matcher in scene.js; no library, no typo tolerance.",
      why: "The map opens offline with nothing loaded; tiers rank predictably under unit tests, and edit distance on short names floods the list.",
    },
    {
      decision:
        "Holes match word starts only as one run from one word start, then substring; never skipping words, never as a subsequence.",
      why: "A description is a sentence: across its many words almost any query's letters appear in order.",
    },
    {
      decision: "A hit lands in its home scope, never on an outside proxy.",
      why: "There it is drawn as itself, with its own lanes and details.",
    },
    {
      decision:
        "A query with a separator also names a port after its node, part by part, at the worse tier; nodes and holes keep matching the whole query.",
      why: "Port names repeat (run, get); `tax run` narrows to one node with nothing new to learn, and a description's spaces stay words.",
    },
    {
      decision: "Subsequence hits stay listed but light nothing while a better hit exists.",
      why: "Next to real hits, loose letter matches lit domes as strongly as them.",
    },
    {
      decision: "A click on the map clears the query; / brings it back.",
      why: "The query's dimming overrides selection: a click under it would select out of sight.",
    },
  ],
}).edges({});
