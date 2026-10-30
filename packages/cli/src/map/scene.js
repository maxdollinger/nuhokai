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
