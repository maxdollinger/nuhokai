/**
 * The map's scene: what the viewer draws for each scope, computed from the
 * loaded world ({ id, name, source, nodes, placeholders } of LoadWorld's answer). No imports, no
 * DOM and no three.js: MapFile inlines this module into the page, and the bun
 * tests import it. Types: scene.d.ts.
 *
 * A scope is the top level (the world, which has no node of its own) or one
 * dome. Its islands are its direct children; everything else in it sits at the
 * outer edge: externals by externalType, nodes outside the dome, tbd holes and
 * the dome's own ports as entries. An edge or hole whose user sits deeper is
 * drawn from the island that contains the user.
 *
 * `search` finds nodes, ports and holes across all scopes; `lightsFor` says
 * what stands for them in one scope.
 */

/** The top-level scope's name when the world has none: the map draws unchecked worlds too. */
const FALLBACK_WORLD_NAME = "World";

/** How an external is drawn, by externalType: callers come in from the left, the rest is used on the right. */
const EXTERNAL_LOOKS = {
  caller: { look: "village", side: -1 },
  api: { look: "bank", side: 1 },
  db: { look: "db", side: 1 },
};

/** Index the loaded world once: parents, children and first nodes per id, by position in `nodes`. */
export function mapScene(world) {
  const nodes = world.nodes;
  const byId = new Map();
  const latest = new Map();
  // The loader lists a parent before its children, so the parent is the latest node with that id so far.
  const parents = nodes.map((node, index) => {
    const parent = node.parent === null ? null : (latest.get(node.parent) ?? null);
    latest.set(node.id, index);
    return parent;
  });
  nodes.forEach((node, index) => {
    if (!byId.has(node.id)) byId.set(node.id, index);
  });
  const children = new Map([[null, []]]);
  nodes.forEach((_, index) => {
    children.set(index, []);
  });
  parents.forEach((parent, index) => {
    children.get(parent).push(index);
  });
  return { world, nodes, parents, children, byId };
}

/** The direct child of `scope` that contains node `index` (itself included), or undefined if it lies outside. */
function childIn(scene, index, scope) {
  for (let current = index; current !== null; current = scene.parents[current]) {
    if (scene.parents[current] === scope) return current;
  }
  return undefined;
}

/** The kind of a port a node declares or inherits from a contract it implements; unknown ports count as calls. */
function portKind(scene, index, name) {
  const node = scene.nodes[index];
  const own = (node.ports ?? []).find((port) => port.name === name);
  if (own) return own.kind;
  for (const edge of node.edges ?? []) {
    const contract = edge.kind === "implements" ? scene.nodes[scene.byId.get(edge.to)] : undefined;
    const inherited = (contract?.ports ?? []).find((port) => port.name === name);
    if (inherited) return inherited.kind;
  }
  return "call";
}

/** The top-level scope's name, which no node owns: the world's name (from defineWorld), else the fallback. */
function worldName(scene) {
  const name = scene.world.name;
  return typeof name === "string" && name.trim() !== "" ? name : FALLBACK_WORLD_NAME;
}

/** The breadcrumbs from the world to `scope`. */
function pathTo(scene, scope) {
  const path = [];
  for (let current = scope; current !== null; current = scene.parents[current]) {
    path.unshift({ scope: current, name: scene.nodes[current].name });
  }
  return [{ scope: null, name: worldName(scene) }, ...path];
}

/**
 * Everything one scope draws: items (islands and the outer edge), lanes, air
 * routes and pillars. `scope` is null for the top level, else a dome's index.
 * Item keys: `node:<index>` for nodes, `tbd:<index>` for holes, `entry` for a
 * dome's ports. Deterministic: the same world gives the same view.
 */
export function scopeView(scene, scope) {
  const items = new Map();
  const lanes = new Map();
  const air = new Map();

  const nodeItem = (index, inside) => {
    const key = `node:${index}`;
    if (items.has(key)) return key;
    const node = scene.nodes[index];
    if (node.external) {
      const { look, side } = EXTERNAL_LOOKS[node.externalType] ?? EXTERNAL_LOOKS.api;
      items.set(key, { key, kind: "external", node: index, name: node.name, side, look, ports: [] });
    } else if (inside) {
      const parts = scene.children.get(index).length;
      items.set(key, {
        key,
        kind: "island",
        node: index,
        name: node.name,
        side: 0,
        status: node.status,
        abstract: node.abstract,
        dome: parts > 0,
        parts,
        group: node.group ?? null,
        level: 0,
      });
    } else {
      items.set(key, { key, kind: "outside", node: index, name: node.name, side: 1, ports: [] });
    }
    return key;
  };

  /** The item a node is drawn as in this scope: its containing island, or itself at the outer edge. */
  const itemOf = (index) => {
    const child = childIn(scene, index, scope);
    return child === undefined ? nodeItem(index, false) : nodeItem(child, true);
  };

  /** An edge target: a node of the world, or an id nothing in the world has. */
  const targetOf = (id) => {
    const index = scene.byId.get(id);
    if (index !== undefined) return { key: itemOf(index), index };
    const key = `missing:${id}`;
    if (!items.has(key)) items.set(key, { key, kind: "outside", node: null, name: id, side: 1, ports: [] });
    return { key, index: undefined };
  };

  const addTo = (map, key, record, values) => {
    const entry = map.get(key) ?? record;
    for (const value of values) if (!entry.ports.includes(value)) entry.ports.push(value);
    map.set(key, entry);
  };
  const lane = (from, to, kind, ports) => addTo(lanes, `${kind}|${from}|${to}`, { from, to, kind, ports: [] }, ports);
  const route = (from, to, ports) => addTo(air, `${from}|${to}`, { from, to, ports: [] }, ports);
  const notePorts = (key, ports) => {
    const item = items.get(key);
    if (item.ports) for (const port of ports) if (!item.ports.includes(port)) item.ports.push(port);
  };

  for (const index of scene.children.get(scope)) nodeItem(index, true);

  scene.nodes.forEach((node, index) => {
    if (childIn(scene, index, scope) === undefined) return;
    const from = itemOf(index);
    for (const edge of node.edges ?? []) {
      const target = targetOf(edge.to);
      if (target.key === from) continue;
      if (edge.kind === "implements") {
        lane(from, target.key, "implements", []);
        continue;
      }
      // A port of a node deeper inside the target island is named with its node.
      const deeper = target.index !== undefined && items.get(target.key).node !== target.index;
      const label = (port) => (deeper ? `${scene.nodes[target.index].name}.${port}` : port);
      const kindOf = (port) => (target.index === undefined ? "call" : portKind(scene, target.index, port));
      const calls = edge.port.filter((port) => kindOf(port) === "call").map(label);
      const events = edge.port.filter((port) => kindOf(port) === "event").map(label);
      // Listening to an event is an air route from the publisher; an edge with both kinds is both.
      if (calls.length) lane(from, target.key, "uses", calls);
      if (events.length) route(target.key, from, events);
      notePorts(target.key, [...calls, ...events]);
    }
  });

  scene.world.placeholders.forEach((placeholder, index) => {
    const users = [];
    for (const id of placeholder.users) {
      const user = scene.byId.get(id);
      if (user === undefined || childIn(scene, user, scope) === undefined) continue;
      const from = itemOf(user);
      if (!users.includes(from)) users.push(from);
    }
    if (!users.length) return;
    const key = `tbd:${index}`;
    items.set(key, {
      key,
      kind: "hole",
      node: null,
      name: placeholder.description,
      side: 1,
      portKind: placeholder.kind,
      codeName: placeholder.name ?? null,
      users: [...placeholder.users].sort(),
    });
    for (const from of users) lane(from, key, "hole", []);
  });

  if (scope !== null) {
    const entries = (scene.nodes[scope].ports ?? []).filter((port) => port.delegate);
    if (entries.length) {
      const name = `${scene.nodes[scope].name} ports`;
      items.set("entry", { key: "entry", kind: "entry", node: null, name, side: -1, ports: [] });
      for (const port of entries) {
        const child = scene.children.get(scope).find((index) => scene.nodes[index].id === port.delegate.to);
        if (child === undefined) continue;
        notePorts("entry", [port.name]);
        lane("entry", nodeItem(child, true), "entry", [port.name]);
      }
    }
  }

  levelIslands(items, [...lanes.values()]);

  const pillars = new Map();
  for (const item of items.values()) {
    if (item.kind !== "island" || item.group === null) continue;
    const pillar = pillars.get(item.group) ?? { id: item.group, name: item.group, members: [] };
    pillar.members.push(item.key);
    pillars.set(item.group, pillar);
  }

  return {
    scope,
    name: scope === null ? worldName(scene) : scene.nodes[scope].name,
    path: pathTo(scene, scope),
    items: [...items.values()],
    lanes: [...lanes.values()],
    air: [...air.values()],
    pillars: [...pillars.values()],
  };
}

/** An island's level is the longest chain of calls it makes to other islands; a cycle adds nothing. */
function levelIslands(items, lanes) {
  const calls = new Map();
  for (const lane of lanes) {
    if (lane.kind !== "uses" || items.get(lane.to)?.kind !== "island") continue;
    calls.set(lane.from, [...(calls.get(lane.from) ?? []), lane.to]);
  }
  const levels = new Map();
  const visiting = new Set();
  const level = (key) => {
    if (levels.has(key)) return levels.get(key);
    if (visiting.has(key)) return -1;
    visiting.add(key);
    const below = (calls.get(key) ?? []).map(level);
    visiting.delete(key);
    const value = below.length ? 1 + Math.max(...below) : 0;
    levels.set(key, value);
    return value;
  };
  for (const item of items.values()) if (item.kind === "island") item.level = level(item.key);
}

/**
 * What the click panel shows for a node: its NodeSpec fields only, purpose,
 * status, ports, requirements and source, in that order.
 */
export function detailsOf(node) {
  const kind = node.external ? `external ${node.externalType ?? "api"}` : node.abstract ? "contract" : null;
  return {
    name: node.name,
    status: node.status,
    kind,
    purpose: node.purpose,
    sections: [
      {
        label: "Ports",
        rows: (node.ports ?? []).map((port) => ({
          name: port.name,
          meta: [port.kind, port.purpose, port.delegate ? `via ${port.delegate.port}` : null]
            .filter((part) => part)
            .join(" · "),
        })),
      },
      {
        label: "Requirements",
        rows: (node.requirements ?? []).map((requirement) => ({
          name: requirement.kind === "constraint" ? `${requirement.id} (constraint)` : requirement.id,
          meta: requirement.text,
        })),
      },
      { label: "Source", rows: (node.source ?? []).map((glob) => ({ name: glob, meta: "" })) },
    ],
  };
}

/** Ties in search: nodes, then nodes ranked up with their port, holes, ports. */
const KIND_ORDER = { node: 0, promoted: 1, hole: 2, port: 3 };
/** Subsequence matches need this many query characters: shorter ones match nearly anything. */
const SUBSEQUENCE_FROM = 3;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const UPPER = /\p{Lu}/u;
const LOWER_OR_DIGIT = /[\p{Ll}\p{N}]/u;
/** A port named after its node: `stock reserve`, `stock.reserve`, `Stock › reserve`, `stock/reserve`; the node's part and the port's around the last separators. */
const OWNER_AND_PORT = /^(.+?)[\s.›/]+([^\s.›/]+)$/u;

/** The query as matchText takes it: folded, and its letters and digits alone for word starts and subsequences. */
const queryOf = (full) => ({ full, compact: full.replace(/[^\p{L}\p{N}]/gu, "") });
/** `match` with its positions `by` characters further right, as in a label behind a prefix; null stays null. */
const shifted = (match, by) => match && { ...match, positions: match.positions.map((at) => at + by) };

/** `length` indexes from `from` on. */
const range = (from, length) => Array.from({ length }, (_, i) => from + i);

/** Lower case, one UTF-16 unit per unit, so an index into it is an index into `text`. */
function fold(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const lower = text[i].toLowerCase();
    out += lower.length === 1 ? lower : text[i];
  }
  return out;
}

/** Where words start: the first letter or digit after anything else, and a capital after a small letter or digit (camelCase). */
function wordStarts(text) {
  const starts = [];
  for (let i = 0; i < text.length; i++) {
    if (!WORD_CHAR.test(text[i])) continue;
    if (i === 0 || !WORD_CHAR.test(text[i - 1]) || (UPPER.test(text[i]) && LOWER_OR_DIGIT.test(text[i - 1]))) {
      starts.push(i);
    }
  }
  return starts;
}

/**
 * `q` from character `qi` on as prefixes of words in order, from word `from` on (words may be skipped): the matched
 * indexes, or null. `failed` remembers dead ends, so a long description stays quick.
 */
function wordMatch(low, starts, q, qi, from, failed) {
  if (qi === q.length) return [];
  const key = qi * (starts.length + 1) + from;
  if (failed.has(key)) return null;
  for (let w = from; w < starts.length; w++) {
    let n = 0;
    while (qi + n < q.length && low[starts[w] + n] === q[qi + n]) n++;
    for (; n > 0; n--) {
      let next = w + 1;
      while (next < starts.length && starts[next] < starts[w] + n) next++;
      const rest = wordMatch(low, starts, q, qi + n, next, failed);
      if (rest) return [...range(starts[w], n), ...rest];
    }
  }
  failed.add(key);
  return null;
}

/** The tightest run holding `q`'s characters in order, scored by its span; null if there is none. */
function subsequence(low, q) {
  let best = null;
  for (let start = low.indexOf(q[0]); start !== -1; start = low.indexOf(q[0], start + 1)) {
    const positions = [start];
    for (let i = start + 1; i < low.length && positions.length < q.length; i++) {
      if (low[i] === q[positions.length]) positions.push(i);
    }
    if (positions.length < q.length) break; // no later start finishes either
    const span = positions[positions.length - 1] - start + 1;
    if (!best || span < best.score) best = { tier: 5, score: span, positions };
  }
  return best;
}

/**
 * How `text` matches the query at its best tier: { tier, score, positions } or null. A `sentence` (a hole's
 * description) matches word starts only as one run from a single word start, and never as a subsequence: its words
 * are many, so skipping some would match almost any query.
 */
function matchText(text, query, sentence) {
  const low = fold(text);
  const { full, compact } = query;
  if (low === full) return { tier: 1, score: 0, positions: range(0, full.length) };
  if (low.startsWith(full)) return { tier: 2, score: 0, positions: range(0, full.length) };
  if (sentence) {
    const start = wordStarts(text).find((at) => low.startsWith(full, at));
    if (start !== undefined) return { tier: 3, score: 0, positions: range(start, full.length) };
  } else {
    const words = compact ? wordMatch(low, wordStarts(text), compact, 0, 0, new Set()) : null;
    if (words) return { tier: 3, score: 0, positions: words };
  }
  const at = low.indexOf(full);
  if (at !== -1) return { tier: 4, score: 0, positions: range(at, full.length) };
  return !sentence && compact.length >= SUBSEQUENCE_FROM ? subsequence(low, compact) : null;
}

/** A hole's home: the deepest scope holding every user, so each is drawn there as an island or inside one; undefined if no user resolves. */
function holeHome(scene, placeholder) {
  let home;
  for (const id of placeholder.users) {
    const user = scene.byId.get(id);
    if (user === undefined) continue;
    const chain = pathTo(scene, scene.parents[user]).map((crumb) => crumb.scope);
    if (!home) home = chain;
    else {
      let n = 0;
      while (n < home.length && n < chain.length && home[n] === chain[n]) n++;
      home = home.slice(0, n);
    }
  }
  return home?.[home.length - 1];
}

/**
 * Every node and port matching `query` by name and every tbd hole by its description, across all scopes, best
 * first: by tier (exact, prefix, word starts, substring, subsequence), a subsequence by its span, then nodes, holes,
 * ports, each in world order. Case-insensitive; holes match word starts only as one run and stop at substring;
 * subsequences need 3 characters. A query with a separator also names a port after its node: the part before the
 * last separator matches the node's name, the rest the port's, ranked by the worse tier. A blank query matches
 * nothing. A hole also matches by its export name, as a node does. A node found by its name's start (prefix, word
 * starts) ranks with its own port that matches better, after the nodes matching that well themselves. Each hit lands in
 * its home scope as `key`.
 */
export function search(scene, query) {
  const full = fold(query.trim());
  if (full === "") return [];
  const q = queryOf(full);
  const parts = full.match(OWNER_AND_PORT);
  const ownerQ = parts && queryOf(parts[1]);
  const portQ = parts && queryOf(parts[2]);
  const found = [];
  const add = (kind, label, match, scope, key, node, port) => {
    if (!match) return;
    found.push({
      rank: match.tier,
      score: match.score,
      order: KIND_ORDER[kind],
      hit: {
        kind,
        label,
        positions: match.positions,
        tier: match.tier,
        scope,
        path: pathTo(scene, scope),
        key,
        node,
        port,
      },
    });
  };
  scene.nodes.forEach((node, index) => {
    add("node", node.name, matchText(node.name, q, false), scene.parents[index], `node:${index}`, index, null);
  });
  scene.world.placeholders.forEach((placeholder, index) => {
    const home = holeHome(scene, placeholder);
    if (home === undefined) return;
    // `tbd notifyCustomer: Tell a customer…`: its export name as a node's, its description as a sentence; the better one.
    const prefix = placeholder.name ? `tbd ${placeholder.name}: ` : "tbd: ";
    const byName = placeholder.name ? shifted(matchText(placeholder.name, q, false), "tbd ".length) : null;
    const byText = shifted(matchText(placeholder.description, q, true), prefix.length);
    const match = !byText || (byName && byName.tier <= byText.tier) ? byName : byText;
    add("hole", prefix + placeholder.description, match, home, `tbd:${index}`, null, null);
  });
  scene.nodes.forEach((node, index) => {
    const prefix = `${node.name} › `;
    // `stock reserve`: the node's name before the last separator, the port's after; as good as the worse of the two.
    const owner = ownerQ && matchText(node.name, ownerQ, false);
    for (const port of node.ports ?? []) {
      const plain = shifted(matchText(port.name, q, false), prefix.length);
      const named = owner && shifted(matchText(port.name, portQ, false), prefix.length);
      const both = named && {
        tier: Math.max(owner.tier, named.tier),
        score: owner.score + named.score,
        positions: [...owner.positions, ...named.positions],
      };
      const match = both && (!plain || both.tier <= plain.tier) ? both : plain;
      add("port", prefix + port.name, match, scene.parents[index], `node:${index}`, index, port.name);
    }
  });
  // `load`: LoadWorld (prefix) before LoadWorld › load (exact). A node found by its name's start ranks with its best
  // port, after nodes as good themselves: both land on it, and the node is what the name was typed for.
  const nodes = new Map(found.filter((entry) => entry.hit.kind === "node").map((entry) => [entry.hit.node, entry]));
  for (const entry of found) {
    const node = entry.hit.kind === "port" && nodes.get(entry.hit.node);
    if (node && node.hit.tier <= 3 && entry.rank < node.rank)
      Object.assign(node, { rank: entry.rank, score: entry.score, order: KIND_ORDER.promoted });
  }
  // Stable: equal rank, score and order keep world order.
  return found.sort((a, b) => a.rank - b.rank || a.score - b.score || a.order - b.order).map((entry) => entry.hit);
}

/**
 * What stands for each hit in `view`: its own item if drawn there (an island, external or outside proxy), else the
 * island containing it; the open dome and its ports: the entry; a port's node stands for the port; a hole only where
 * it is drawn. One light per item, in hit order, with how many hits from inside it stands for. Subsequence hits light
 * nothing while a better hit lights something here: next to real hits, loose ones would light half the map.
 */
export function lightsFor(scene, view, hits) {
  const drawn = new Set(view.items.map((item) => item.key));
  const standIn = (hit) => {
    if (drawn.has(hit.key)) return hit.key;
    if (hit.node === null) return undefined;
    const child = childIn(scene, hit.node, view.scope);
    if (child !== undefined) return `node:${child}`;
    // The open dome is not drawn in itself; its ports stand at the edge as the entry.
    return hit.node === view.scope && drawn.has("entry") ? "entry" : undefined;
  };
  const light = (some) => {
    const lights = new Map();
    for (const hit of some) {
      const key = standIn(hit);
      if (key === undefined) continue;
      const entry = lights.get(key) ?? { key, inside: 0 };
      if (key !== hit.key && key !== "entry") entry.inside++;
      lights.set(key, entry);
    }
    return [...lights.values()];
  };
  const better = light(hits.filter((hit) => hit.tier < 5));
  return better.length ? better : light(hits);
}
