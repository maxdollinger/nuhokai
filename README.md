# nuhokai

nuhokai lets you write down a codebase's architecture as TypeScript files next to the code: its parts, what each one
is for and what it depends on. A CLI checks that description, draws it as a 3D map and lets coding agents build and
review code against it.

![The 3D map of nuhokai's own CLI](docs/map.png)

_nuhokai's own CLI, drawn by `nuhokai map`._

## Why

**The problem.** Coding agents write code faster than anyone can read it. They see the files they open, not the
design, so boundaries blur and dependencies grow in every direction. The people responsible for the system lose the
overview they need to judge what is being built.

**The goal.** Combine human understanding and judgement with the speed of LLM-written code, and make good design the
easy path. People decide the design at a level they can keep in their head. Agents write the code inside it.

**The approach.** UML could describe a design too, but a diagram never fails. In nuhokai the design is types, so a
broken reference or a rule that doesn't hold is an error within seconds, for the person in the editor and for the
agent in its loop. Rules become checks you can enforce, and the agent has a spec to build from and to check its code
against.

## How it works

You describe your system in a `nuhokai/` folder, using four things:
- A **node** is one part of the system, with a purpose, a status and the code it covers.
- A **port** is something a node offers to others: a call or an event.
- **`uses`** lists the ports of other nodes that a node depends on.
- **`tbd`** is a placeholder for a port that is not designed yet.

```ts
// nuhokai/shop.ts
import { node, tbd } from "@nuhokai/world";

// Not designed yet, but already usable.
export const notify = tbd.call({ description: "Tell the customer; channel not decided." });

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
  requirements: [{ id: "R1", text: "An order is only placed when all its lines are reserved." }],
}).edges({
  uses: () => [Stock.reserve, notify],
});
```

```ts
// nuhokai/index.ts: the entry point, listing the top-level nodes
import { defineWorld } from "@nuhokai/world";
import { Orders, Stock } from "./shop.ts";

export default defineWorld({
  id: "01a17bb6-ad4d-7298-8492-a53237d45f80",
  name: "Shop",
  source: ["src/**"],
  children: [Orders, Stock],
});
```

Because `Stock.reserve` is a typed reference, your editor completes it and jumps to it, and a mistake fails. Write
`Stock.reserv` and `nuhokai check` says:

```text
error: nuhokai/shop.ts:22: Property 'reserv' does not exist on type 'NodeHandle'. Did you mean 'reserve'?
```

These files are only read, never run, and need no dependencies in your repo. Nodes can also be nested, share
contracts and record requirements, test cases and design decisions; see the
[format](packages/world/README.md).

## The map

`nuhokai map` draws your system as a 3D map in one HTML file. Follow dependencies, search for any node or port, and
double-click a node to look inside it. Colors show each node's status and `tbd` placeholders stand out, so you see
what is missing and where the architecture is tangled or thin.

## Usage

Download the archive for your platform from the [releases](https://github.com/maxdollinger/nuhokai/releases), unpack
it and put the `nuhokai` binary on your `PATH`, keeping it next to its `tsgo/` folder. Nothing else to install.
1. `nuhokai init` creates `nuhokai/` with an example node to copy from.
2. Describe your system: one node per part, with its ports and what it uses.
3. `nuhokai check` verifies the description. Run it after every change, by hand, by your agent or in CI.
4. Let your agent build a node, then run `nuhokai review <node>`: it prints a prompt with which your agent reviews
   that node's code against its spec.
5. `nuhokai map` and `nuhokai tree` show the whole system, as a map or as one line per node.

`nuhokai <command> --help` explains each command; more in the [CLI README](packages/cli/README.md).

## Development

```sh
bun install && bun test && bun run typecheck && bun run check
```

## License

[Apache License 2.0](packages/cli/LICENSE).
