# nuhokai

Describe a codebase's architecture as typed, checkable TypeScript that lives in the repo beside the code, and that
people and coding agents can both read, navigate and act on.

## Motivation

The design of a system usually lives outside its code: diagrams that go stale, wiki pages nobody updates, decisions
that only exist in someone's head. Nothing breaks when the code and the description drift apart, so they do.

That gap hurts more now that coding agents write much of the code. An agent sees the files it opens, not the
boundaries between components, what each one is for, what it may depend on, or why it was built that way. It needs the
architecture in a form it can find, read and check its work against, and so does every person who joins the project.

## Goal

One source of truth for a system's structure and intent that

- sits in the repository and is versioned and reviewed with the code;
- is precise enough for tools to check: a reference to a component or port that does not exist is an error, not a
  stale arrow in a diagram;
- carries the "why": each component's purpose, its requirements, test cases and design decisions, including the
  options that were rejected;
- marks what is not designed yet explicitly, instead of leaving it out;
- stays readable as plain text for people, and parseable for agents and scripts.

## How it works

A repository describes itself as a **world**: a graph of **nodes** written in a `nuhokai/` folder.

- **Nodes are TypeScript, read as data.** Every node is a `node({ … }).edges({ … })` call. Edges are typed references
  to other nodes' ports, so plain `tsc` catches dangling references, and your editor's completion, go-to-definition
  and find-references work on the architecture out of the box. World files are never run: the tooling reads them with
  the TypeScript checker, and `@nuhokai/world` is types only, with no runtime code and no dependencies.
- **Leaves and domes.** A leaf declares its own ports (calls and events) and the ports it `uses`. A dome groups
  children and exposes some of their ports; it has no behavior of its own. Abstract nodes are contracts that others
  `implements`; external nodes are things you depend on but do not build (a database, a third-party API).
- **Holes.** `tbd.call(…)` and `tbd.event(…)` are typed placeholders for ports that are not designed yet. They fit
  wherever a real port does, so a plan can be wired up before every detail is known.
- **Specs, not just boxes.** Beside its ports, a node carries its `purpose`, `status` (`planned`, `building`, `built`,
  `deprecated`), the `source` globs where its code lives, and optionally `requirements`, `testCases` and `decisions`.
- **The CLI checks and shows it.** `nuhokai check` type-checks the world and enforces the rules tsc cannot (unique
  ids, orphans, `uses` scope, every `source` matching real files). `nuhokai tree` prints the hierarchy one grep-able
  line per node, `nuhokai map` draws a self-contained 3D map, and `nuhokai review` hands your coding agent a prompt to
  review a node's code against its spec, then validates its findings. Every output line is meant to be acted on by a
  person or an agent alone: `<severity>: <file>:<line>: <node>: <rule>; <fix>`.

## Example

A small shop backend, declared in `nuhokai/`:

```ts
// nuhokai/shop.ts
import { node, tbd } from "@nuhokai/world";

// Not designed yet, but already typed and referenceable.
export const notifyCustomer = tbd.call({ description: "Tell a customer their order changed; channel not decided." });

// Run by ops, not built by us.
export const Postgres = node({
  id: "01a16dd2-bc36-723e-8ba3-48099f422a52",
  external: true,
  externalType: "db",
  purpose: "The shared database.",
  status: "built",
  source: [],
  ports: { query: { kind: "call", purpose: "Run SQL", transport: "postgres" } },
}).edges({});

export const Stock = node({
  id: "01a16dd2-bc2d-708e-89cb-3a9da2e0550d",
  purpose: "Counts what is on the shelf and holds reservations.",
  status: "planned",
  source: ["src/stock/**"],
  ports: {
    reserve: { kind: "call", purpose: "Reserve items for an order", input: "order id and lines", errors: ["short"] },
  },
}).edges({
  uses: () => [Postgres.query],
});

export const Orders = node({
  id: "01a16dd2-bc20-732c-ae7b-02362b8baff1",
  purpose: "Owns orders from checkout to delivery; does not know how stock is counted.",
  status: "planned",
  source: ["src/orders/**"],
  ports: {
    place: { kind: "call", purpose: "Place an order", input: "cart lines", output: "order id" },
  },
  requirements: [{ id: "R1", text: "An order is only placed when all its lines are reserved." }],
}).edges({
  uses: () => [Stock.reserve, notifyCustomer], // `Stock.reserv` would fail tsc
});

// A dome: a pure container that exposes a child's port.
export const Shop = node({
  id: "01a16dd2-bc14-752c-b0df-585621a330ab",
  purpose: "The shop backend; everything a customer interacts with lives inside it.",
  status: "planned",
  source: ["src/**"],
  children: [Orders, Stock],
  ports: { placeOrder: Orders.place },
}).edges({});
```

```ts
// nuhokai/index.ts: the world, the only entry point
import { defineWorld } from "@nuhokai/world";
import { Postgres, Shop } from "./shop.ts";

export default defineWorld({
  id: "01a17bb6-ad4d-7298-8492-a53237d45f80",
  name: "Shop",
  source: ["src/**"],
  children: [Postgres, Shop],
});
```

## Usage

Download the `nuhokai` binary for your platform (macOS arm64, Linux x86_64, Linux arm64) from the
[releases](https://github.com/maxdollinger/nuhokai/releases). It is self-contained: your repo needs no Node, Bun,
TypeScript or `node_modules`.

```sh
nuhokai init                 # write nuhokai/ with a world, an example node, its tsconfig and the format's types
nuhokai check                # type-check the world and run the global rules; exit 1 on any error
nuhokai tree                 # the hierarchy, one line per node: path | source | purpose
nuhokai tree Shop -L 0       # everything below Shop
nuhokai map                  # write nuhokai/.generated/map.html, an offline 3D map of the world
nuhokai review Shop/Orders   # print a prompt for your coding agent to review Orders against its spec
nuhokai review --submit      # validate the agent's JSON findings from stdin
```

Every command takes `--path <dir>` to work in another project directory, and `nuhokai <command> --help` documents its
arguments, output lines and exit codes, so an agent can learn the CLI from `--help` alone.

The format's full rules are in [packages/world/README.md](packages/world/README.md), the CLI's in
[packages/cli/README.md](packages/cli/README.md). Both packages describe themselves in their own `nuhokai/` folders.

## Development

TypeScript on Bun, with Biome for lint and format.

```
packages/
  world/                world format: node types, node()/defineWorld, leaves and domes, typed refs, tbd
  cli/                  @nuhokai/cli: the toolchain around the world format (`init`, `map`, `check`, `tree` and `review`)
```

```sh
bun install
bun test            # all tests
bun run typecheck   # tsc per workspace
bun run check       # biome lint + format check (bun run fix to apply)
```

## License

[Apache License 2.0](packages/world/LICENSE).
