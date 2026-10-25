# @nuhokai/world

The world format (MAX-10, MAX-12): every node is a TS file in a repo's `nuhokai/` folder, and its edges are typed
references to other nodes. One world file, `nuhokai/index.ts`, places every node in a tree. `tsc` alone catches dangling references, and
completion, go-to-definition and find-references work out of the box.

```ts
import { defineNode, tbd } from "@nuhokai/world";

export const notifyCustomer = tbd.call({ description: "Tell the customer; channel not decided" });

export const Shop = defineNode({
  id: "01a16dd2-bc14-752c-b0df-585621a330ab", // any unique string, e.g. bun -e 'console.log(Bun.randomUUIDv7())'
  purpose: "The shop backend.",
  status: "planned",
  source: [],
  ports: { placeOrder: { kind: "call", purpose: "Place an order" } },
  delegate: { placeOrder: () => Orders.place },
}).edges({});

export const Orders = defineNode({
  id: "01a16dd2-bc20-732c-ae7b-02362b8baff1",
  purpose: "Owns orders.",
  status: "planned",
  source: [],
  ports: { place: { kind: "call", purpose: "Place an order" } },
  implements: () => [AuditLog],
}).edges({
  uses: () => [Stock.reserve, notifyCustomer],
});
```

```ts
// nuhokai/index.ts: the loader's only entry point; the world contains exactly the nodes listed here.
import { defineWorld, relation } from "@nuhokai/world";

export default defineWorld({
  children: [
    Postgres,
    AuditLog,
    relation({
      parent: Shop,
      children: [Orders, Stock],
    }),
  ],
});
```

`children` takes nodes and nested `relation(...)` objects. A subtree can be exported from its own file and composed
(`export const shop = relation({ parent: Shop, children: [...] })`), so the world file stays small. Node files never
import the world file, so it adds no import cycles.

The runtime has no imports and no side effects: `defineNode`, `defineWorld`, `relation`, `inherited` and `tbd` only
build frozen objects. `example/` is a complete small world: `example/index.ts` holds its world and re-exports its nodes,
so it is the barrel and not a node file; `example/type-errors.ts` lists what must not compile; `nuhokai/world-format.ts`
is this package described as a node, including its design decisions, and `nuhokai/index.ts` is its world (`init` writes
the same folder into a repo).

## How it maps to MAX-5 (`nuhokai/node@1`)

`NodeDef` is `Omit<NodeSpec, …>` plus the fields below, so MAX-5 stays the only source of truth for every other field.
A compile-time check fails if the two drift apart.

| MAX-5                         | World format                                                              |
| ----------------------------- | ------------------------------------------------------------------------- |
| `schema`                      | implied                                                                   |
| `id` (slug = file name)       | `id`: any string, stable across renames and moves                         |
| `name`                        | not authored; the export name (taken by the loader)                       |
| `parent: NodeId \| null`      | not a node field: `relation({ parent, children })` in the world file      |
| `external`, `abstract`        | optional, default `false`; carried on the handle as literal types         |
| `ports: Port[]`               | `ports: { [name]: Port }`; `Node.name` is a typed port reference          |
| `delegate: { to, port }`      | `delegate: { [ownPort]: () => Child.port }` in `defineNode`, same kind    |
| `edges: uses` (grouped by to) | `.edges({ uses: () => [A.port, B.port, hole] })`, flat; the loader groups |
| `edges: implements`           | `implements: () => [Contract]` in `defineNode` (see below)                |

## Rules worth knowing

- **Two steps, no annotations.** `defineNode` takes the static fields and infers the handle's type; `.edges()` takes
  only `uses` and is not generic. A node's type therefore never depends on a node that could point back, so files may
  reference each other in cycles without any type annotation. `.edges()` is required, also as `.edges({})`: a draft is
  not a node, and using one as a reference fails tsc.
- **`implements` and `delegate` are in step one** (still lazy), because the handle's type records the contracts it
  implements and the nodes it delegates to. That is safe: contracts reference no other node in step one, and delegation
  only points down to direct children. `uses` may point anywhere, also back, so it stays in `.edges()` (TS7022).
- **Handles expose own ports only.** An implementor's inherited port is `inherited(Orders, AuditLog.history)`; it fails
  tsc unless Orders implements AuditLog, and works in `uses` and `delegate`. `AuditLog.history` alone depends on the
  contract, not on Orders.
- **Port names** must be literal (a `PortsDef`-typed variable is rejected, it would make any `Node.typo` compile), not
  empty, not `__proto__`, and must not start with `$` (reserved for the handle's `$ref` and `$def`).
- **A rule is in tsc when the error lands on the offending element** with a readable `Forbidden<"…">` message. Global
  rules, where tsc could only point at `defineWorld`, are the loader's (see below).
- **MAX-5 rules checked by tsc** through the literal flags, ids and names: abstract nodes have no `uses`, no delegates
  and implement nothing; external nodes do not delegate; `externalType` only on external nodes; only own ports
  delegate, and a delegated port declares no `input`, `output`, `errors` or `payload`; an own port must not have the
  name of an inherited one, a contract is listed once in `implements`, and two implemented contracts must not share a
  port name; requirement ids are unique (non-literal ids are left to the loader), and `testCases[].demonstrates` names
  own requirement ids only (whether an implementor may demonstrate a contract's requirement is open in MAX-5). Flags
  that are not literals count as possibly true.
- **World rules checked by tsc:** `relation.parent` is a node that is known to be neither external nor abstract;
  external nodes are top level only; every delegate target of a parent is one of its `children` (a nested relation
  counts through its parent), and a node delegating to a node must be a relation's parent; `children` is not empty;
  strings, drafts, ports and look-alike objects are rejected in `parent` and `children`. Children typed as unions
  (`WorldChild`, an inferred mixed array) are accepted, each node judged by its own flags; a widened `WorldChild` may
  be external, so it is accepted only in `defineWorld`.
- **Placeholders:** `tbd.call` / `tbd.event` take a `description` that is not blank (as `trim()` sees it) and return an unresolved port reference
  (`UnresolvedPortRef`, alias `TbdPortRef`), with `$ref: "unresolved"`; real ports have `"port"`, inherited ones
  `"inherited"`. Declare them at module level and export them, so find-references lists every dependent.
- **Ids** are plain strings (MAX-5 `NodeId`); tsc does not check their format. Written as literals, they stay literal
  types on the handle, which the contract and delegate rules compare; a widened `string` id is left to the loader.

## For the loader

- The entry point is the default export of `nuhokai/index.ts`, a `$ref: "world"` object whose `children` are nodes and
  `$ref: "relation"` objects (`parent`, `children`), all frozen. A node's parent is the relation it is listed under.
- Every exported node has `$ref: "node"`; `$def` holds both steps as authored, deep-frozen, with the edges still lazy
  functions (`uses`, `implements`, and `delegate` keyed by port name). An exported `$ref: "draft"` means `.edges()` was
  forgotten.
- Global rules, each reported with `file:line`, node name and one sentence: duplicate ids (also a node listed twice,
  naming both places); orphans (nodes exported but not listed in the world); `uses` scope (sibling or sibling of an
  ancestor) against the world tree; unique display names. The loader re-checks every tsc rule, because a cast bypasses
  the types.
- Resolve references by **object identity**: a port reference is one of the frozen objects on a handle (or one created
  by `inherited` / `tbd`), and `node` is the handle itself. The brands make forgeries fail tsc, but a cast passes, so
  never resolve by `$ref` plus id and name.

## Typecheck cost

The step-one and world rules make the checker do more work. Measured with tsc 7.0.2 `--extendedDiagnostics` (median
of 8 runs) before and after MAX-12:

| Program                      | Types           | Instantiations   | Check time      |
| ---------------------------- | --------------- | ---------------- | --------------- |
| example world (`example/`)   | 3,590 → 7,394   | 5,077 → 14,404   | 0.012s → 0.030s |
| whole package (`tsc -p .`)   | 9,911 → 23,079  | 12,368 → 43,151  | 0.050s → 0.11s  |
| synthetic world of 200 nodes | 33,487 → 67,579 | 47,895 → 223,722 | 0.15s → 0.5s    |

Rules evaluate to `unknown` while satisfied: a tuple intersected with a rule tuple is compared method by method, which
had made the 200-node world take 2.2s.

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
