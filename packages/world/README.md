# @nuhokai/world

The world format (MAX-10): every node is a TS file in a `world/` folder, and its edges are typed references to other
nodes. `tsc` alone catches dangling references, and completion, go-to-definition and find-references work out of the box.

```ts
import { defineNode, inherited, tbd } from "@nuhokai/world";

export const notifyCustomer = tbd.call({ description: "Tell the customer; channel not decided" });

export const Shop = defineNode({
  id: "01a16dd2-bc14-752c-b0df-585621a330ab", // uuidv7: bun -e 'console.log(Bun.randomUUIDv7())'
  purpose: "The shop backend.",
  status: "planned",
  source: [],
  ports: { placeOrder: { kind: "call", purpose: "Place an order" } },
}).edges({
  delegate: { placeOrder: () => Orders.place },
});

export const Orders = defineNode({
  id: "01a16dd2-bc20-732c-ae7b-02362b8baff1",
  purpose: "Owns orders.",
  status: "planned",
  source: [],
  ports: { place: { kind: "call", purpose: "Place an order" } },
  implements: () => [AuditLog],
}).edges({
  parent: () => Shop,
  uses: () => [Stock.reserve, notifyCustomer],
});
```

The runtime has no imports and no side effects: `defineNode`, `inherited` and `tbd` only build frozen objects.
`example/` is a complete small world; `example/type-errors.ts` lists what must not compile; `world/world-format.ts` is
this package described as a node, including its design decisions.

## How it maps to MAX-5 (`nuhokai/node@1`)

`NodeDef` is `Omit<NodeSpec, …>` plus the fields below, so MAX-5 stays the only source of truth for every other field.
A compile-time check fails if the two drift apart.

| MAX-5                         | World format                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `schema`                      | implied                                                                       |
| `id` (slug = file name)       | `id`: uuidv7, stable across renames and moves                                 |
| `name`                        | not authored; the export name (taken by the loader)                           |
| `parent: NodeId \| null`      | `.edges({ parent: () => Node })`; absent = top level; never external/abstract |
| `external`, `abstract`        | optional, default `false`; carried on the handle as literal types             |
| `ports: Port[]`               | `ports: { [name]: Port }`; `Node.name` is a typed port reference              |
| `delegate: { to, port }`      | `.edges({ delegate: { [ownPort]: () => Child.port } })`, same kind            |
| `edges: uses` (grouped by to) | `.edges({ uses: () => [A.port, B.port, hole] })`, flat; the loader groups     |
| `edges: implements`           | `implements: () => [Contract]` in `defineNode` (see below)                    |

## Rules worth knowing

- **Two steps, no annotations.** `defineNode` takes the static fields and infers the handle's type; `.edges()` takes the
  references to other nodes and is not generic. A node's type therefore never depends on another node, so files may
  reference each other in cycles without any type annotation. `.edges()` is required, also as `.edges({})`: a draft is
  not a node, and using one as a reference fails tsc.
- **`implements` is in step one** (still lazy), because the handle's type records the contracts it implements. That is
  safe: contracts reference no other node in step one.
- **Handles expose own ports only.** An implementor's inherited port is `inherited(Orders, AuditLog.history)`; it fails
  tsc unless Orders implements AuditLog, and works in `uses` and `delegate`. `AuditLog.history` alone depends on the
  contract, not on Orders.
- **Port names** must be literal (a `PortsDef`-typed variable is rejected, it would make any `Node.typo` compile), not
  empty, not `__proto__`, and must not start with `$` (reserved for the handle's `$ref` and `$def`).
- **MAX-5 rules checked by tsc** through the literal flags: external nodes have no parent; abstract nodes have no `uses`,
  no delegates and implement nothing; `externalType` only on external nodes; a delegated port declares no `input`,
  `output`, `errors` or `payload`. Flags that are not literals count as possibly true.
- **Placeholders:** `tbd.call` / `tbd.event` take a non-empty `description` and return an unresolved port reference
  (`UnresolvedPortRef`, alias `TbdPortRef`), with `$ref: "unresolved"`; real ports have `"port"`, inherited ones
  `"inherited"`. Declare them at module level and export them, so find-references lists every dependent.
- **Ids** are typed as a loose uuidv7 template (five groups, version 7) to catch slugs; full validation, duplicate ids,
  scope, delegate targets being direct children, and port name clashes with inherited ports are the loader's job.

## For the loader

- Every exported node has `$ref: "node"`; `$def` holds both steps as authored, deep-frozen, with the edges still lazy
  functions (`parent`, `uses`, `implements`, and `delegate` keyed by port name). An exported `$ref: "draft"` means
  `.edges()` was forgotten.
- Resolve references by **object identity**: a port reference is one of the frozen objects on a handle (or one created
  by `inherited` / `tbd`), and `node` is the handle itself. The brands make forgeries fail tsc, but a cast passes, so
  never resolve by `$ref` plus id and name.

## Compiler options

The world must be type-checked with `strict: true`. `inherited()` relies on `strictFunctionTypes`; the other checks also
hold without `strict`. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are not relied upon. The CLI should
own the world's tsconfig later, instead of trusting the repo's.

## Types and the zero-dependency goal

The MAX-5 node types live in `src/node-spec.ts` as plain, type-only TypeScript (no TypeBox, no runtime values), and
`NodeDef` is derived from them, so they stay the only source of truth for node fields. The package has no dependencies
at all; a test checks that the runtime source files import nothing.

`src/declarations.test.ts` emits declarations for `src`, proves they are self-contained (no non-relative imports), and
that a two-file world with a cycle, type-checked against the emitted `.d.ts` alone, still gets the brand, flag and
`inherited` errors. This is the `.d.ts` the CLI can ship.

## License

[Apache License 2.0](LICENSE).
