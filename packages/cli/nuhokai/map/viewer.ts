import { node } from "@nuhokai/world";
import { Browser, ThreeJs } from "../external.ts";

/** The map's page: what the browser draws from the loaded world. */
export const Viewer = node({
  id: "01a17bb5-b066-71d0-a81d-ccdfa4cb5fde",
  what: "Own the drawing: the page turning the loaded world into towers, domes, lanes and holes in the browser.",
  why: "Drawing runs in the browser, apart from the CLI that writes the file. Never writes files, inlines assets or picks where the map goes.",
  source: ["src/map/viewer.html", "src/map/scene.js", "src/map/scene.d.ts"],
  ports: {
    draw: {
      kind: "call",
      purpose: "Draw the loaded world in the browser",
      input: "LoadWorld.load's id, name, source, nodes and placeholders as JSON in the page's one data block",
      output:
        "the drawn page: towers per scope on their level rings, edges, holes, saved layout, click details, search, cones",
    },
  },
  requirements: [
    { id: "R1", text: "Top level: top-level nodes as islands. A dome: its direct children as islands." },
    {
      id: "R2",
      text: "Double-click opens a dome; breadcrumbs lead back. The top level, first breadcrumb and page title carry the world's name, else World.",
    },
    {
      id: "R15",
      text: "Double-click on any other node (a leaf island, an external, an outside proxy, the entry for the open dome) lands on that node in its own parent dome as a search hit does (R13), selected, every port the item showed marked; a tbd hole or an id missing from the world stays put. Each one's tooltip says so.",
    },
    {
      id: "R3",
      text: "uses: lanes carrying their ports, from the node inside that uses them (its block in the roof; the roof's middle when the island itself does) straight down inside the tower, out through the wall at the height of the roof they land on, onto the callee's roof (its middle when it has no nodes inside); event ports: dashed violet lines from the publisher's roof to the listener. No line passes through a tower. A slow swell of light drifts along each line toward where it lands; none with reduced motion. An edge from inside a dome starts at that dome. Edge tags (ports, event names) only on the hovered, selected or search-marked item's edges; none under a query.",
    },
    {
      id: "R4",
      text: "implements: dashed lane to the contract; abstract: a contract tower, see-through with a dashed violet rim.",
    },
    {
      id: "R5",
      text: "Dome ports: entries to their delegate. group: an outline round its towers. externals: an arc of the outer edge, callers on the left. The entry's and an outside node's labels count their ports (`enters via 1 port`, `used for 12 ports`), never list them.",
    },
    {
      id: "R6",
      text: "A node's complexity in three steps, simple, mid, complex, shown in its details, as its dot in search results and as its tower's width (wider is more complex), never as a colour: an estimate from the spec alone, never authored. One score for leaves and domes: the ports it offers (inherited ones among them), the ports and tbd holes it or a node inside it uses outside itself (each once), its requirements (a contract's among them) and the nodes inside it. Under 10 simple, from 16 complex. An external has none and keeps its own colour.",
    },
    { id: "R7", text: "tbd: dashed hole with its description; from inside a dome it starts at that dome." },
    {
      id: "R8",
      text: "Layout: the Mountain, one ring on the ground per level, the highest level in the middle (alone there when it holds one island), level 0 outside, each ring far enough out that its towers and their dots clear each other and the next ring in, by one gap, grown until saved angles fit too; on a ring the islands keep the order of what they share lanes with further in, seeded by ids. An island moves only round its own level's ring and never onto another island there, by the layout's gap; an outer item along the edge; dragging a group's outline turns its islands round their rings together. Moved angles persist per browser under nuhokai.map.layout.<world id>, by scope (the world's or a dome's id) and node id, a tbd hole by its description and sorted user ids; a position saved before the rings is dropped (only moved islands were saved, so the centre they stood round is unknown); a regenerated map reuses them; a scope drops saved items it no longer draws; Reset layout forgets the scope's.",
    },
    {
      id: "R9",
      text: "Click: the complexity with the parts it was estimated from (R6), then NodeSpec fields only: the deprecation note, what, why, ports, requirements, source. Each port and requirement on two rows, its name above its details; long names and unbroken text wrap, never widen the panel. A source path on one line, cut at the front so its end shows, whole on hover, with a button that copies it.",
    },
    { id: "R10", text: "The mouse wheel zooms toward the point under the cursor." },
    {
      id: "R14",
      text: "Up to 520px wide the view controls are an icon row under the search box, their names kept for screen readers: never under the help button or details.",
    },
    {
      id: "R16",
      text: "No legend on the map: a ? button at the bottom left (up to 640px wide at the top right, clear of the details), or the ? key outside the search box and without Ctrl, Alt or ⌘, opens a modal built once that explains the map in sections: towers (height, the dots round the foot, blocks in the roof, contracts), lines (call, entry and external, event, dashed, focused, cones), the edge (external, outside node, entry, tbd hole, group) and using the map (touch screens: tap, no keys). Escape, × or a click on the backdrop closes it, a selection dragged out of it does not; while open, no key reaches the map.",
    },
    {
      id: "R11",
      text: "Search (/ or Ctrl K, ⌘K on Apple; the placeholder names both, touch screens neither): every node and port by name, every tbd hole by export name and description, whatever scope is open. Case-insensitive tiers: exact, prefix, word starts, substring, subsequence (3+ characters, tighter first); a hole's description: word starts only as one run, no subsequence; with a separator (space . › /) a port also by its node's name before the last one and its own after, at the worse tier; a node found by prefix or word starts ranks with its own port that matches better, after nodes as good themselves; ties: nodes, holes, ports, then world order. Results: a complexity dot (a hole: dashed), matches bold, holes on up to two lines, the home scope's breadcrumbs without the world's (`top` there), past 50 a `50 of N — keep typing` row, at most 35% of a phone's height; one active row, which the mouse moves too; `None in this view` when no hit lights the open scope; arrows, Enter or click, Escape; keys typed in the box, IME commits included, never go up or jump. Each row's accessible name reads `name, kind of owner, in path`; one polite live region announces the count, No matches and each landing.",
    },
    {
      id: "R12",
      text: "A query lights what stands for each hit in the open scope (the item, its dome or outside proxy; a port's node; the open dome's entry for it and its ports), subsequence hits only if no better hit lights something there, and dims the rest harder than hover or selection, lit labels tinted; a lit dome standing for hits inside shows `N inside`. A click on the map clears it.",
    },
    {
      id: "R13",
      text: "Enter or click lands in the hit's home scope (a node's parent, a port's node's parent, a hole's deepest scope holding all its users), centred at the scope's home zoom: a node selected; a port's node selected, the port's row marked and in view; a hole lit as on hover until the next click, Escape or scope change. A home scope inside an island of the open one dives into that island as double-click does; another fades; landing in another scope flashes the breadcrumbs. A hit chosen during a move waits for it, the latest one wins. / or Ctrl/⌘K on an empty box (on touch screens, a tap into it) brings back the non-blank query a jump or map click cleared, selected.",
    },
    {
      id: "R17",
      text: "An island is a translucent tower, an obelisk upside down: a narrow foot, a roof as wide as its complexity, as tall as its level, a faint ring on its wall at each level below; the nodes inside are blocks in one row just under the roof; a lane lands on the spot of the port it calls. Round its foot: a filled dot per node that depends on it, a hollow ring per node it depends on, directly or not, by calls and events (a listener depends on the publisher; tbd holes and a dome's entry are no nodes), the busier of the two rings outside with a thin line through it. Warm paper in the light theme, graphite in the dark one, as the system sets; depends-on red and used-by blue differ in shape and brightness, not only hue.",
    },
    {
      id: "R18",
      text: "Cones, a button, off at first, remembered per browser: off, a hovered or selected tower lights its direct neighbours and the lanes to them; on, everything it depends on and everything that depends on it, by calls and events, fading with each hop, the lanes between them red toward what it depends on and blue from what depends on it. A hovered or selected tower shows a card in place of its name: its level, what is inside, and both counts, direct and in all, each with its mark from the ground.",
    },
  ],
  testCases: [
    {
      text: "scene.js under bun, example world: on top, the Postgres lane starts at Stock inside Shop, AuditLog's implements lanes at nodes inside Shop.",
      demonstrates: ["R3"],
    },
    {
      text: "scene.js under bun: a uses b uses c, d uses b and implements c → b depends on c, a and d on b; c's up cone b at 1, a and d at 2, used by 3 nodes, 1 direct; implements counts for neither. Example world: Stock, listening to Orders' cancelled, depends on Orders; Shop's cone holds Postgres and its tbd hole, but depends on 1 node; the entry is in the graph, not counted.",
      demonstrates: ["R17", "R18"],
    },
    {
      text: "scene.js under bun: freeAngle keeps a clear angle, else the nearest clear one, null on a full ring; saved angles kept, positions from before the rings and junk dropped; a five-level chain with four more on level 1 → the top alone in the middle, rings growing outward, no footprints closer than they need, the same layout twice, a fixed angle kept, and two islands saved on one angle kept apart.",
      demonstrates: ["R8"],
    },
    {
      text: "By hand, headless Chromium, @nuhokai/cli's world, light and dark: towers on their level rings, dots round the feet, lines around the towers; dragging Path moves it round level 1's ring only, saves its angle, and after a reload it is still there; hovering Build shows its card; Cones on lights Build's whole chain.",
      demonstrates: ["R3", "R8", "R17", "R18"],
    },
    {
      text: "scene.js under bun, example world: Stock's Postgres lane and notifyCustomer hole start at Shop on top, at Stock inside Shop.",
      demonstrates: ["R3", "R7"],
    },
    {
      text: "scene.js under bun: a dome with 1 port, 1 requirement, 2 nodes inside that use 3 outside ports (one of them from both) and 1 hole → 8, simple, the edge between the two not counted; an implementor with 9 requirements, its contract's port and 2 requirements → 16, complex; an external → none.",
      demonstrates: ["R6"],
    },
    {
      text: "scene.js under bun, example world: inside Shop, Postgres lands on top with query, AuditLog on top with none, the entry on Shop on top with placeOrder and orderHistory, Stock in Shop; the hole and an unknown key → null.",
      demonstrates: ["R15"],
    },
    {
      text: "By hand, headless Chromium, example world: inside Shop, double-clicking Postgres, the entry and AuditLog each fade to the top, centred and selected, the ports marked in the details.",
      demonstrates: ["R15"],
    },
    {
      text: "By hand, browser, example world: Postgres at the edge as db, AuditLog as contract, Shop opens to Orders and Stock, clicking Orders shows its fields only.",
      demonstrates: ["R1", "R2", "R4", "R5", "R9"],
    },
    {
      text: "By hand, headless Chromium, example world: inside Shop the entry reads `enters via N ports` and Postgres's ports are not listed on its label; an outside node used for one port reads `used for 1 port`.",
      demonstrates: ["R5"],
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
      text: "scene.js under bun: the click panel's sections are kinds ports, requirements and source, the source rows the paths as written.",
      demonstrates: ["R9"],
    },
    {
      text: "By hand, headless Chromium: a node with a long unbroken name, a long port name, a long requirement id, a URL in its deprecation note and a deeply nested source path → no horizontal scroll at 1280 and 390px wide; each port and requirement shows its name above its details; the path shows its file name, whole on hover; its button copies the whole path; with the clipboard refused the button shows the failure and the path is selected.",
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
      text: "scene.js under bun, example world: `or` → Orders, Shop › orderHistory, the hole, Shop › placeOrder, AuditLog › history; `ore` → tighter subsequences first; `hist` skips the hole; `pg` and blank → none; the hole as `tbd notifyCustomer: …`: `notify`, `cust`, `ncu` by name, `a cust` word starts and `hang` substring in the description, `op` none, `to` substring; an inline hole as `tbd: …`.",
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
      text: "scene.js under bun: `dec` with a top-level dec and Directive inside dome A → on top dec alone lights; inside A, Directive lights.",
      demonstrates: ["R12"],
    },
    {
      text: "scene.js under bun, example world: on top `or` lights Shop with 1 inside (Orders; its own ports count none), `reserve` Shop with 1 inside; inside Shop the entry counts none.",
      demonstrates: ["R12"],
    },
    {
      text: "scene.js under bun: `load` over Loader, LoadWorld and Reload, each with a port load, and a node load → load, Loader, LoadWorld, the three ports, then Reload (a substring stays).",
      demonstrates: ["R11"],
    },
    {
      text: "By hand, headless Chromium, example world: hovering a row moves the one active row and Enter takes it; on top `/` then `stock` + Enter dives into Shop and flashes the breadcrumbs; Enter again during a move lands the latest; `stock`, a map click, `/`, a space, a map click, `/` → `stock` back; inside Shop `postgres`, then Shop's hit list with nothing drawn here shows None in this view.",
      demonstrates: ["R11", "R13"],
    },
    {
      text: "By hand, headless Chromium, 390px with touch, light and dark: the controls are an icon row under the search box, clear of the help button and the details.",
      demonstrates: ["R14"],
    },
    {
      text: "By hand, headless Chromium, light, dark and 390px with touch: no legend; ? (button or key) opens the help, Escape and a backdrop click close it, the map stays in its scope.",
      demonstrates: ["R16"],
    },
    {
      text: "By hand, headless Chromium, example world: `customer` + Enter → Shop open, the hole and its lanes lit, plain after a click; `reserve` + Enter → reserve marked in Stock's details, then / brings `reserve` back selected; a click on Shop while `stock` is typed clears the query and selects Shop; `stock` dims the rest harder than hover, Shop's label tinted.",
      demonstrates: ["R12", "R13"],
    },
    {
      text: "By hand, headless Chromium, example world: no lane or event tag at first; hovering Shop shows its lanes' tags, leaving hides them; clicking Shop keeps them; typing `stock` hides them; inside Shop, hovering Orders tags reserve and cancelled, not Stock's Postgres lane.",
      demonstrates: ["R3"],
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
    {
      decision:
        "Complexity is estimated from the spec and shown in the details and search; towers stay neutral. The map shows no state.",
      why: "Where the complexity sits is what a reader of the map cannot see from the islands; whether a node has code is in its source, and check and review say whether the code matches. The estimate needs no model and no code, so a node has it before it is built.",
      rejected: [
        {
          option: "Colour each island by its complexity",
          why: "Three blues on every island competed with the lines and dots that say what depends on what; the colours left on the map now each mean one thing.",
        },
        {
          option: "Colour by state: an authored status, or planned and built read from source",
          why: "The authored status drifted and no tool verified it; the derived one said only whether source is empty.",
        },
        {
          option: "A dome's score = the sum of the leaves inside it",
          why: "Every dome then lands in the top step. Judged as one component at its own level, domes and leaves share one scale.",
        },
        {
          option: "Count the nodes that depend on it",
          why: "That is the risk of changing it, not how complex it is: Failure has the most dependents and is simple.",
        },
        {
          option: "An LLM estimate, or lines of code",
          why: "Not reproducible, and the map calls no model; lines exist only once there is code, and the map reads no project files.",
        },
      ],
    },
    {
      decision: "Edge tags hidden until an end is hovered or selected.",
      why: "Every lane tagged at once buries the islands; the tags you want are the ones of the item you look at.",
    },
    {
      decision: "Islands are round towers, upside-down obelisks, on one ring per level: the Mountain.",
      why: "Height and ring both say the level, so depth reads from any angle; a round wall needs only its rims drawn; the narrow foot leaves the ground free for the dots, the wide roof room for the blocks inside. Moving only round the ring keeps that order however a reader arranges the map.",
      rejected: [
        {
          option: "Free placement, seeded by a force layout",
          why: "Levels mixed across the board, so the height of a tower was the only clue to its depth.",
        },
        {
          option: "Lift and land the islands",
          why: "With towers as tall as their level there is nothing left to lift.",
        },
        {
          option: "A switch for events on or off",
          why: "Events are as much a dependency as calls; dashed and violet, they stay apart without hiding.",
        },
      ],
    },
    {
      decision: "Used-by blue, filled; depends-on red, hollow.",
      why: "Green and coral were the same brightness: one colour for red-green colour blindness and in greyscale. Blue and red, in shape as well as in brightness, stay apart without colour vision.",
    },
    {
      decision: "sRGB colours, three.js's own light units and a perspective camera, as the design study draws them.",
      why: "The map looks just like the design it was chosen from; the r128 palette that needed colour management off is gone with the islands.",
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
      decision: "Double-click on a node at the edge goes to it, as a search hit; on a dome it still opens it.",
      why: "What sits at a dome's edge is drawn there only as a proxy; its own lanes and details are in its home scope, and searching for a name already on screen is a detour.",
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
      decision: "Subsequence hits stay listed but light nothing while a better hit lights something in the open scope.",
      why: "Next to real hits, loose letter matches lit domes as strongly as them; but a better hit elsewhere must not leave this scope dark.",
    },
    {
      decision: "A jump lands at the scope's home zoom, not closer.",
      why: "A close landing cropped the scope; the selection or mark already points at the hit, the neighbours give the place.",
    },
    {
      decision: "A tbd hole is searchable by its export name, which the loader carries.",
      why: "Code refers to a hole by that name (notifyCustomer); the description alone missed it.",
    },
    {
      decision: "A click on the map clears the query; / brings it back.",
      why: "The query's dimming overrides selection: a click under it would select out of sight.",
    },
  ],
}).edges({ uses: () => [Browser.runPage, Browser.store, ThreeJs.render] });
