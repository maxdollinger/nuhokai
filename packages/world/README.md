# @nuhokai/world

The world format: every node is a TS file in a repo's `nuhokai/` folder, and its edges are typed
references to other nodes. One world file, `nuhokai/index.ts`, lists the top-level nodes. `tsc` alone catches dangling
references, and completion, go-to-definition and find-references work out of the box.

```ts
import { inherited, node } from "@nuhokai/world";

export const Orders = node({
  id: "01a16dd2-bc20-732c-ae7b-02362b8baff1", // any unique string
  purpose: "Owns orders.",
  status: "planned",
  source: [],
  ports: { place: { kind: "call", purpose: "Place an order" } },
  implements: () => [AuditLog],
}).edges({
  uses: () => [Stock.reserve, notifyCustomer],
});

// A dome: children plus the ports it exposes from them. It has no behavior of its own.
export const Shop = node({
  id: "01a16dd2-bc14-752c-b0df-585621a330ab",
  purpose: "The shop backend.",
  status: "planned",
  source: [],
  children: { orders: Orders, stock: Stock },
  ports: (c) => ({
    placeOrder: c.orders.ports.place,
    orderHistory: inherited(c.orders, AuditLog.history),
  }),
}).edges({});
```

```ts
// nuhokai/index.ts: the loader's only entry point; the world contains exactly the nodes reachable from here.
import { defineWorld } from "@nuhokai/world";

export default defineWorld({
  id: "01a17bb6-ad4d-7298-8492-a53237d45f80", // the world's own id, like a node's
  children: [Postgres, AuditLog, Shop],
});
```

## Leaves and domes

- A **leaf** has no `children`. It declares its own `ports` and may have `uses` edges.
- A **dome** has a non-empty `children` record. It is a pure container: its behavior is its children, so it has no
  `uses` edges of its own. Its `ports` are a function over the direct children:
  `ports: (c) => ({ run: c.cmd.ports.run })`. A child's port reference supplies the port's kind and shapes; the dome's
  own port is a new reference bound to the dome. Direct children only: a grandchild must first be exposed by its own
  parent.
- `children` is a record, not an array, so `ports` can name a child (`c.orders`). Child names are local to the dome.
- `defineWorld({ id, children })` lists only top-level nodes. There is no `relation()`: the hierarchy lives inside the
  node it belongs to. A subtree can still live in its own file by exporting the dome that owns it, and node files
  never import the world file.
- The world's `id` is required and has a node id's form. Tools key per-world state by it (the map's saved layout), so
  every world gets its own; `nuhokai init` generates one.

The runtime has no imports and no side effects: `node`, `defineWorld`, `inherited` and `tbd` only build frozen
objects. `example/` is a complete small world: `example/index.ts` holds its top level and re-exports its nodes, so it
is the barrel and not a node file; `example/type-errors.ts` lists what must not compile; `nuhokai/world-format.ts` is
this package described as a node, including its design decisions, and `nuhokai/index.ts` is its world (`init` writes
this kind of folder into a repo).

## How it maps to the node spec (`nuhokai/node@1`)

`NodeDef` is `Omit<NodeSpec, …>` plus the fields below, so the node spec stays the only source of truth for every other field.
A compile-time check fails if the two drift apart.

| Node spec                     | World format                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `schema`                      | implied                                                                               |
| `id` (slug = file name)       | `id`: any string, stable across renames and moves                                     |
| `name`                        | not authored; the export name (taken by the loader)                                   |
| `parent: NodeId \| null`      | not a node field: a dome's `children` record; top level is in `defineWorld`           |
| `external`, `abstract`        | optional, default `false`; carried on the handle as literal types                     |
| `ports: Port[]`               | leaf `ports: { [name]: Port }`; dome `ports: (c) => ({ [name]: c.child.ports.port })` |
| `delegate: { to, port }`      | implied by a dome port's child reference; stored on `$def.ports`                      |
| `edges: uses` (grouped by to) | `.edges({ uses: () => [A.port, B.port, hole] })`, flat; the loader groups             |
| `edges: implements`           | `implements: () => [Contract]` in `node` (see below)                                  |

## Rules worth knowing

- **Two steps, no annotations.** `node` takes the static fields and infers the handle's type; `.edges()` takes only
  `uses` and is not generic. A node's type therefore never depends on a node that could point back, so files may
  reference each other in cycles without any type annotation. `.edges()` is required, also as `.edges({})`: a draft is
  not a node, and using one as a reference fails tsc.
- **`implements` and `children` are in step one** (still lazy), because the handle's type records the contracts it
  implements and the direct children a dome exposes. That is safe: `children` only points down, so it never forms a
  type cycle. `uses` may point anywhere, also back, so it stays in `.edges()` (TS7022).
- **Domes are containers, not code.** A node with children cannot be external or abstract, cannot have `uses`, and
  cannot author node-spec port definitions: every port must reference a direct child's port.
- **Handles expose own ports only.** A handle has one property per own port (`Orders.place`) and the same references
  under `ports` (`Orders.ports.place`), so a dome can write `c.orders.ports.place`. An implementor's inherited port is
  `inherited(Orders, AuditLog.history)`; it fails tsc unless Orders implements AuditLog, and works in `uses` and as a
  dome port. `AuditLog.history` alone depends on the contract, not on Orders.
- **Port names** must be literal (a `PortsDef`-typed variable is rejected, it would make any `Node.typo` compile), not
  empty, not `__proto__`, and must not start with `$` (reserved for `$ref` and `$def`) or be `ports` (reserved for the
  handle's port namespace).
- **A rule is in tsc when the error lands on the offending element** with a readable `Forbidden<"…">` message. Global
  rules, where tsc could only point at `defineWorld`, are `check`'s (see below).
- **Node-spec rules checked by tsc** through the literal flags, ids and names: abstract nodes have no `uses`, implement
  nothing and have no children; external nodes have no children and are top level only; `externalType` only on
  external nodes; an own port must not have the name of an inherited one, a contract is listed once in `implements`,
  and two implemented contracts must not share a port name; requirement ids are unique (non-literal ids are left to
  `check`), and `testCases[].demonstrates` names own requirement ids only (whether an implementor may demonstrate
  a contract's requirement is open in the node spec). Flags that are not literals count as possibly true.
- **Dome rules checked by tsc:** `children` is a non-empty record of nodes, each neither external nor abstract (nor
  possibly so); a dome's ports reference a port of one of its direct children, under a literal, non-reserved name; a
  placeholder is not a child port.
- **World rules checked by tsc:** `defineWorld` needs an `id`; its `children` are not empty and holds nodes only (externals and contracts
  are allowed at the top level); strings, drafts, ports, relations and look-alike objects are rejected.
- **Placeholders:** `tbd.call` / `tbd.event` take a `description` that is not blank (as `trim()` sees it) and return an
  unresolved port reference (`UnresolvedPortRef`, alias `TbdPortRef`), with `$ref: "unresolved"`; real ports have
  `"port"`, inherited ones `"inherited"`. Declare them at module level and export them, so find-references lists every
  dependent.
- **Ids** of nodes and worlds are plain strings (`NodeId`); tsc does not check their format. Written as literals, they stay literal
  types on the handle, which the contract, child and dome-port rules compare; a widened `string` id is left to
  `check`.

## For the loader and `check`

- The entry point is the default export of `nuhokai/index.ts`, a `$ref: "world"` object with the world's `id` and
  `children`, the top-level nodes, all frozen.
- Every exported node has `$ref: "node"`; `$def` holds both steps as authored, deep-frozen, with the edges still lazy
  functions (`uses`, `implements`). A dome's `$def.children` is its direct-children record (references kept by
  identity), and `$def.ports` holds the resolved node-spec port definitions: each copies the child port and carries
  `delegate: { to: childId, port: childPortName }`. An exported `$ref: "draft"` means `.edges()` was forgotten.
- The loader evaluates the world and reports evaluation failures only; it judges nothing. Global rules are `check`'s
  (planned), each reported with `file:line`, node name and one sentence: duplicate ids (also a node listed twice,
  naming both places); orphans (nodes exported but not reachable from the world); `uses` scope (sibling or sibling of
  an ancestor) against the world tree; unique display names. `check` re-checks every tsc rule, because a cast
  bypasses the types.
- Resolve references by **object identity**: a port reference is one of the frozen objects on a handle (or one created
  by `inherited` / `tbd`), and `node` is the handle itself. The brands make forgeries fail tsc, but a cast passes, so
  never resolve by `$ref` plus id and name. `node()` also checks at runtime that every dome port belongs to one of its
  direct children.

## Compiler options

The world must be type-checked with `strict: true`. `inherited()` relies on `strictFunctionTypes`; the other checks
also hold without `strict`. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are not relied upon. The CLI
owns the world's tsconfig: `nuhokai init` writes one with these options instead of trusting the repo's; the planned
`nuhokai update` refreshes it.

## Types and the zero-dependency goal

The node types live in `src/node-spec.ts` as plain, type-only TypeScript (no TypeBox, no runtime values), and
`NodeDef` is derived from them, so they stay the only source of truth for node fields. The package has no dependencies
at all; a test checks that the runtime source files import nothing. They are also exported, type-only, as
`@nuhokai/world/node-spec` for tooling such as the CLI's loader; world files import only `@nuhokai/world`.

`src/declarations.test.ts` emits declarations for `src`, proves they are self-contained (no non-relative imports), and
that a two-file world with a cycle and a dome, type-checked against the emitted `.d.ts` alone, still gets the brand,
flag, child and `inherited` errors. This is the `.d.ts` the CLI can ship.

## License

[Apache License 2.0](LICENSE).
