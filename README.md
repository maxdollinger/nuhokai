# nuhokai

**Let agents write the code. Keep the architecture yours.**

nuhokai turns your system's design into typed TypeScript that lives in your repo. You decide the design, coding agents
build inside it, and a broken rule is an error within seconds, not a surprise in review.

![The 3D map of nuhokai's own CLI](docs/map.png)

## The problem

Coding agents write code faster than anyone can read it. They see files, not the design, so boundaries blur,
dependencies spread, and you lose the overview you need to judge what is being built.

## What you get

- **A design that can fail.** A diagram never complains. Here the design is types: a wrong dependency or a broken
  rule fails in your editor, in CI and in the agent's loop.
- **Agents that stay on track.** Every part has a spec to build from, and `nuhokai review` lets your agent check its
  code against it.
- **The whole system at a glance.** A searchable 3D map shows what depends on what, what is still missing and where
  the architecture gets tangled.
- **Nothing to set up.** One binary, no dependencies in your repo. Your design files are only read, never run.

## See it

Describe each part of your system: what it is for, what it offers and what it uses.

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

Depend on something that does not exist, and you and your agent hear about it at once:

```text
error: nuhokai/shop.ts:19: Property 'reserv' does not exist on type 'NodeHandle'. Did you mean 'reserve'?
```

## Get started

Download the binary from the [releases](https://github.com/maxdollinger/nuhokai/releases), then:

```sh
nuhokai init     # create nuhokai/ with an example to copy from
nuhokai check    # verify your design, by hand, by your agent or in CI
nuhokai map      # see your system as a 3D map
```

Go deeper: the [format](packages/world/README.md), the [CLI](packages/cli/README.md), or `nuhokai --help`.

[Apache License 2.0](packages/cli/LICENSE)
