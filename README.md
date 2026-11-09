# nuhokai

Your architecture as typed TypeScript in the repo, checked like code and readable by people and coding agents.

![The 3D map of nuhokai's own CLI](docs/map.png)

## Why

Coding agents write code fast, but they don't understand a system the way its people do. nuhokai's goal is to combine
the two: people make the design decisions and keep the overview, agents write the code quickly, and good design becomes
the easy path.

UML could describe the design too, but a diagram never fails. In nuhokai the design is types, so a broken reference
or a rule that doesn't hold is an error right away, for the person in the editor and for the agent in its loop. Rules
become checks you can enforce, and the agent always has a spec to build from and something to check its code against.

## How

Each component is a **node** in a `nuhokai/` folder. Edges are typed references, so `tsc` catches a dangling one and
your editor navigates the graph. The files are read as data, never run. `tbd` marks what is not designed yet.

```ts
import { node, tbd } from "@nuhokai/world";

export const notify = tbd.call({ description: "Tell the customer; channel not decided." });

export const Stock = node({
  id: "01a16dd2-bc2d-708e-89cb-3a9da2e0550d",
  purpose: "Counts what is on the shelf and holds reservations.",
  status: "planned",
  source: ["src/stock/**"],
  ports: { reserve: { kind: "call", purpose: "Reserve items for an order" } },
}).edges({});

export const Orders = node({
  id: "01a16dd2-bc20-732c-ae7b-02362b8baff1",
  purpose: "Owns orders from checkout to delivery.",
  status: "planned",
  source: ["src/orders/**"],
  ports: { place: { kind: "call", purpose: "Place an order" } },
}).edges({
  uses: () => [Stock.reserve, notify], // `Stock.reserv` fails tsc
});
```

## The map

`nuhokai map` draws the world as a 3D map, like the one above of nuhokai's own CLI. Explore dependencies, search for
any node or port, and look inside a part by double-clicking it. Colors show each part's status, and `tbd` holes stand
out, so you see what is missing and where the architecture is tangled or thin.

## Usage

Get the binary from the [releases](https://github.com/maxdollinger/nuhokai/releases); nothing else to install.

```sh
nuhokai init     # create nuhokai/ with an example world
nuhokai check    # type-check the world and its rules
nuhokai tree     # one line per node
nuhokai map      # draw the 3D map
nuhokai review   # let your coding agent review a node's code against its spec
```

`nuhokai <command> --help` has the details. Format: [packages/world](packages/world/README.md), CLI:
[packages/cli](packages/cli/README.md).

## Development

```sh
bun install && bun test && bun run typecheck && bun run check
```
