# @nuhokai/world

The world format: every node is a TS file in a repo's `nuhokai/` folder, and its edges are typed
references to other nodes. One world file, `nuhokai/index.ts`, lists the top-level nodes. `tsc` alone catches dangling
references, and completion, go-to-definition and find-references work out of the box. World files are written like
code and read like data: tools such as the CLI read them with the TypeScript checker and never run them, so the
package is types only.

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
  children: [Orders, Stock],
  ports: {
    placeOrder: Orders.place,
    orderHistory: inherited(Orders, AuditLog.history),
  },
}).edges({});
```

```ts
// nuhokai/index.ts: the loader's only entry point; the world contains exactly the nodes reachable from here.
import { defineWorld } from "@nuhokai/world";

export default defineWorld({
  id: "01a17bb6-ad4d-7298-8492-a53237d45f80", // the world's own id, like a node's
  name: "Shop",
  source: ["src/**"], // the code the world covers; every node's source lies under it
  children: [Postgres, AuditLog, Shop],
});
```

## Leaves and domes

- A **leaf** has no `children`. It declares its own `ports` and may have `uses` edges.
- A **dome** has a non-empty `children` list: `children: [Cmd]`. It is a pure container: its behavior is its
  children, so it has no `uses` edges of its own. Its `ports` are a record of the child ports it exposes, each under
  its own name: `ports: { run: Cmd.run }`. A child's port reference supplies the port's kind and shapes; the dome's
  own port is a new reference bound to the dome. Direct children only: a grandchild must first be exposed by its own
  parent.
- In one file, a dome comes after its children: tsc rejects a reference to a const declared further down (TS2448).
  Children only point down, so that order always exists; across files there is no order at all.
- `defineWorld({ id, name, source, children })` lists only top-level nodes. There is no `relation()`: the hierarchy lives inside the
  node it belongs to. A subtree can still live in its own file by exporting the dome that owns it, and node files
  never import the world file.
- The world's `id` is required and has a node id's form. Tools key per-world state by it (the map's saved layout), so
  every world gets its own; `nuhokai init` generates one.
- The world is the outermost container. Its `name` is required and not blank, for tools to show. An
  optional `description` says what the world is for. Its
  `source` lists the code the world covers, like a node's, relative to the project directory; every node's `source`
  lies under it (`check`).

`node`, `defineWorld`, `inherited` and `tbd` are declared, not implemented: nothing in a world file ever runs.
`example/` is a complete small world: `example/index.ts` holds its top level and re-exports its nodes, so it
is the barrel and not a node file; `example/type-errors.ts` lists what must not compile; `nuhokai/world-format.ts` is
this package described as a node, including its design decisions, and `nuhokai/index.ts` is its world (`init` writes
this kind of folder into a repo).

## How it maps to the node spec (`nuhokai/node@1`)

`NodeDef` is `Omit<NodeSpec, …>` plus the fields below, so the node spec stays the only source of truth for every other field.
A compile-time check fails if the two drift apart.

| Node spec                     | World format                                                              |
| ----------------------------- | ------------------------------------------------------------------------- |
| `schema`                      | implied                                                                   |
| `id` (slug = file name)       | `id`: any string, stable across renames and moves                         |
| `name`                        | not authored; the export name (taken by the loader)                       |
| `parent: NodeId \| null`      | not a node field: a dome's `children` list; top level is in `defineWorld` |
| `external`, `abstract`        | optional, default `false`; carried on the handle as literal types         |
| `ports: Port[]`               | leaf `ports: { [name]: Port }`; dome `ports: { [name]: Child.port }`      |
| `delegate: { to, port }`      | implied by a dome port's child reference; the loader fills it in          |
| `edges: uses` (grouped by to) | `.edges({ uses: () => [A.port, B.port, hole] })`, flat; the loader groups |
| `edges: implements`           | `implements: () => [Contract]` in `node` (see below)                      |

## Rules worth knowing

- **Two steps, no annotations.** `node` takes the static fields and infers the handle's type; `.edges()` takes only
  `uses` and is not generic. A node's type therefore never depends on a node that could point back, so files may
  reference each other in cycles without any type annotation. `.edges()` is required, also as `.edges({})`: a draft is
  not a node, and using one as a reference fails tsc.
- **`implements` and `children` are in step one**, because the handle's type records the contracts it implements and
  the direct children a dome exposes. That is safe: `children` only points down, so it never forms a type cycle.
  `uses` may point anywhere, also back, so it stays in `.edges()` (TS7022).
- **`uses` and `implements` are functions, `children` and dome `ports` are not.** Two nodes in one file may use each
  other, and a plain list would reference the later one before its declaration (TS2448); a function body is checked
  later. Children only point down, so they never need that.
- **Nothing runs, so import cycles never matter.** A dome may sit in an import cycle with its children (a child uses a
  node that uses the dome), in any import order: tools read the files, they do not evaluate them.
- **Domes are containers, not code.** A node with children cannot be external or abstract, cannot have `uses`, and
  cannot author node-spec port definitions: every port must reference a direct child's port.
- **Handles expose own ports only.** A handle has one property per own port (`Orders.place`) and the same references
  under `ports` (`Orders.ports.place`). An implementor's inherited port is
  `inherited(Orders, AuditLog.history)`; it fails tsc unless Orders implements AuditLog, and works in `uses` and as a
  dome port. `AuditLog.history` alone depends on the contract, not on Orders.
- **Port names** must be literal (a `PortsDef`-typed variable is rejected, it would make any `Node.typo` compile), not
  empty, not `__proto__`, and must not start with `$` (reserved for `$ref`) or be `ports` (reserved for the
  handle's port namespace).
- **A rule is in tsc when the error lands on the offending element** with a readable `Forbidden<"…">` message. Global
  rules, where tsc could only point at `defineWorld`, are `check`'s (see below).
- **Node-spec rules checked by tsc** through the literal flags, ids and names: abstract nodes have no `uses`, implement
  nothing and have no children; external nodes have no children and are top level only; `externalType` only on
  external nodes; an own port must not have the name of an inherited one, a contract is listed once in `implements`,
  and two implemented contracts must not share a port name; requirement ids are unique (non-literal ids are left to
  `check`), and `testCases[].demonstrates` names own requirement ids only (whether an implementor may demonstrate
  a contract's requirement is open in the node spec). Flags that are not literals count as possibly true.
- **Dome rules checked by tsc:** `children` is a non-empty list of nodes, none external (nor possibly so); a contract
  may be a child; a dome's ports reference a port of one of its direct children, under a literal, non-reserved name; a
  placeholder is not a child port; a dome has no `externalType`.
- **World rules checked by tsc:** `defineWorld` needs an `id`, a `name` that is not blank and a `source`; its `children` are not empty and hold nodes only (externals and contracts
  are allowed at the top level); strings, drafts, ports, relations and look-alike objects are rejected.
- **Placeholders:** `tbd.call` / `tbd.event` take a `description` that is not blank (as `trim()` sees it) and return an
  unresolved port reference (`UnresolvedPortRef`, alias `TbdPortRef`), with `$ref: "unresolved"`; real ports have
  `"port"`, inherited ones `"inherited"`. Declare them at module level and export them, so find-references lists every
  dependent.
- **Ids** of nodes and worlds are plain strings (`NodeId`); tsc does not check their format. Written as literals, they stay literal
  types on the handle, which the contract, child and dome-port rules compare; a widened `string` id is left to
  `check`.

## For the loader and `check`

- World files are read, never run. The entry point is the default export of `nuhokai/index.ts`, a `defineWorld` call
  with the world's `id`, `name`, `source` and `children`, the top-level nodes. A node is a `node(…).edges(…)` call; a
  reference is a name the checker resolves to its declaration, followed through imports, re-exports and aliases. A
  node's ports, a dome's children and ports, and `uses` and `implements` (the function's returned list) are read as
  written; a dome port gets `delegate: { to: childId, port: childPortName }` from its child reference.
- The loader reports what it cannot read as data, at its file and line, and judges nothing else. Global rules are
  `check`'s, each reported with `file:line`, node name and one sentence: duplicate ids (also a node listed twice,
  naming both places); orphans (nodes exported but not reachable from the world); `uses` scope (sibling or sibling of
  an ancestor) against the world tree; every node's `source` under the world's; display names unique among siblings, the top level included. A node's name
  in diagnostics is its path from the world (`Check/SpecCheck`), so a name only has to be unique next to its siblings.
  `check` type-checks the world and keeps world files declarative (calls only to the format's functions, imports only
  `@nuhokai/world` and other world files, no cast but `as const`, no non-null assertion, `any` or `@ts-` directive), so
  the tsc rules hold; it re-checks on the loaded data only what tsc leaves to it (non-literal ids and flags) and the node-spec
  structure, and only when tsc found no error, so a break is never reported twice.
- Resolve references by **declaration**: a node is the `node(…).edges(…)` call a name leads to, so two names for one
  node are one node. The brands make forgeries fail tsc, but a cast passes, so never resolve by id and name.

## Compiler options

The world must be type-checked with `strict: true`. `inherited()` relies on `strictFunctionTypes`; the other checks
also hold without `strict`. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are not relied upon. The CLI
owns the world's tsconfig: `nuhokai init` writes one with these options instead of trusting the repo's; the planned
`nuhokai update` refreshes it.

## Types and the zero-dependency goal

The node types live in `src/node-spec.ts` as plain, type-only TypeScript (no TypeBox, no runtime values), and
`NodeDef` is derived from them, so they stay the only source of truth for node fields. The package has no dependencies
and no runtime code at all; a test checks that every source file transpiles to nothing but the index's re-exports. They are also exported, type-only, as
`@nuhokai/world/node-spec` for tooling such as the CLI's loader; world files import only `@nuhokai/world`.

`src/declarations.test.ts` emits declarations for `src`, proves they are self-contained (no non-relative imports), and
that a two-file world with a cycle and a dome, type-checked against the emitted `.d.ts` alone, still gets the brand,
flag, child and `inherited` errors. This is the `.d.ts` the CLI can ship.

## License

[Apache License 2.0](LICENSE).
