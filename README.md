# nuhokai

**Architecture as code, type-checked. Built for repos where agents write most of the code.**

nuhokai is a TypeScript format and a CLI. You declare your system's components, their interfaces and their
dependencies in a `nuhokai/` folder; `tsc` and `nuhokai check` keep it consistent, and your coding agent builds and
reviews code against it.

![The 3D map of nuhokai's own CLI](docs/map.png)

## The problem

Agents produce code faster than you can review it. They work file by file with no view of the design, so module
boundaries erode and dependencies creep in that nobody decided on. Diagrams and docs don't help: a tool can't check
them, and an agent doesn't read them.

## What you get

- **Dependencies are typed references.** `uses: () => [Stock.reserve]` is real TypeScript: completion,
  go-to-definition and find-references work on your architecture, and a dangling reference is a `tsc` error.
- **Rules you can enforce.** `nuhokai check` exits 1 on violations such as an out-of-scope dependency, a duplicate id
  or a `source` glob matching no files. Each finding is one `file:line` line, easy to grep and easy for an agent to fix.
- **A spec per component.** Purpose, ports, requirements and design decisions sit next to the code. `nuhokai review`
  has your agent check a component's code against them.
- **A map of the real thing.** `nuhokai map` writes a self-contained HTML file: a searchable 3D graph of components,
  dependencies, build status and the parts not designed yet.
- **No toolchain.** One binary with its own type checker. No `node_modules`, no build step; the files are read
  statically and never executed.

## See it

A component is a `node`: its purpose, the code it covers, the ports it offers and the ports it uses.

```ts
// nuhokai/shop.ts
import { node } from "@nuhokai/world";

export const Stock = node({
  id: "01a16dd2-bc2d-708e-89cb-3a9da2e0550d",
  purpose: "Counts what is on the shelf and holds reservations.",
  status: "built",
  source: ["src/stock/**"],
  ports: { reserve: { kind: "call", purpose: "Reserve items for an order" } },
}).edges({});

export const Orders = node({
  id: "01a16dd2-bc20-732c-ae7b-02362b8baff1",
  purpose: "Owns orders from checkout to delivery; does not know how stock is counted.",
  status: "planned",
  source: ["src/orders/**"],
  ports: { place: { kind: "call", purpose: "Place an order" } },
}).edges({
  uses: () => [Stock.reserve],
});
```

Typo a dependency and `nuhokai check` (or plain `tsc`) fails:

```text
error: nuhokai/shop.ts:19: Property 'reserv' does not exist on type 'NodeHandle'. Did you mean 'reserve'?
```

## Get started

Download the binary from the [releases](https://github.com/maxdollinger/nuhokai/releases), then:

```sh
nuhokai init     # scaffold nuhokai/ with an example node, a tsconfig and the format's types
nuhokai check    # type-check and run the rules; exit 1 on errors, so it fits CI and agent loops
nuhokai map      # write nuhokai/.generated/map.html
```

Go deeper: the [format](packages/world/README.md), the [CLI](packages/cli/README.md), or `nuhokai --help`.

[Apache License 2.0](packages/cli/LICENSE)
