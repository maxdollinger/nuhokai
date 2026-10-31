/** Types of scene.js, the map's scene logic; the page inlines the JS, so it stays plain JS. */
import type { NodeSpec, NodeStatus } from "@nuhokai/world/node-spec";
import type { LoadedWorld } from "../load/load-world.ts";

/** A scope: null for the top level, else the dome's position in `nodes`. */
export type Scope = number | null;

export interface Scene {
  readonly world: LoadedWorld;
  readonly nodes: readonly NodeSpec[];
  /** Each node's parent, by position; null at the top level. */
  readonly parents: readonly (number | null)[];
  readonly children: ReadonlyMap<Scope, readonly number[]>;
  /** The first node with each id. */
  readonly byId: ReadonlyMap<string, number>;
}

/** A direct child of the scope, drawn as an island coloured by its status. */
export interface Island {
  readonly key: string;
  readonly kind: "island";
  readonly node: number;
  readonly name: string;
  readonly side: 0;
  readonly status: NodeStatus;
  readonly abstract: boolean;
  readonly dome: boolean;
  readonly parts: number;
  readonly group: string | null;
  /** The longest chain of calls to other islands. */
  readonly level: number;
}

/** Something at the outer edge: -1 calls in from the left, 1 is used on the right. */
export type OuterItem =
  | {
      readonly key: string;
      readonly kind: "external";
      readonly node: number;
      readonly name: string;
      readonly side: -1 | 1;
      readonly look: "village" | "bank" | "db";
      readonly ports: readonly string[];
    }
  | {
      readonly key: string;
      readonly kind: "outside";
      readonly node: number | null;
      readonly name: string;
      readonly side: 1;
      readonly ports: readonly string[];
    }
  | {
      readonly key: string;
      readonly kind: "hole";
      readonly node: null;
      /** The placeholder's description. */
      readonly name: string;
      readonly side: 1;
      readonly portKind: "call" | "event";
      /** Every node using the placeholder, by id, sorted; with the description, the hole's saved-layout key. */
      readonly users: readonly string[];
    }
  | {
      readonly key: "entry";
      readonly kind: "entry";
      readonly node: null;
      readonly name: string;
      readonly side: -1;
      readonly ports: readonly string[];
    };

export type Item = Island | OuterItem;

export interface Lane {
  readonly from: string;
  readonly to: string;
  /** uses: calls; implements: dashed to the contract; hole: dashed to a tbd; entry: a dome port to its delegate. */
  readonly kind: "uses" | "implements" | "hole" | "entry";
  readonly ports: readonly string[];
}

/** Events: from the publisher to the node that uses them. */
export interface AirRoute {
  readonly from: string;
  readonly to: string;
  readonly ports: readonly string[];
}

export interface Pillar {
  readonly id: string;
  readonly name: string;
  readonly members: readonly string[];
}

export interface ScopeView {
  readonly scope: Scope;
  readonly name: string;
  readonly path: readonly { readonly scope: Scope; readonly name: string }[];
  readonly items: readonly Item[];
  readonly lanes: readonly Lane[];
  readonly air: readonly AirRoute[];
  readonly pillars: readonly Pillar[];
}

export interface Details {
  readonly name: string;
  readonly status: NodeStatus;
  readonly kind: string | null;
  readonly purpose: string;
  readonly sections: readonly {
    readonly label: string;
    readonly rows: readonly { readonly name: string; readonly meta: string }[];
  }[];
}

/** A search result: a node or port by its name, a tbd hole by its description. */
export interface Hit {
  readonly kind: "node" | "port" | "hole";
  /** What the results list shows: the node's name, `Owner › port`, or `tbd: description`. */
  readonly label: string;
  /** The matched characters, as ascending indexes into label. */
  readonly positions: readonly number[];
  /** 1 exact, 2 prefix, 3 word starts, 4 substring, 5 subsequence; a port named after its node (`stock reserve`): the worse of the two. */
  readonly tier: 1 | 2 | 3 | 4 | 5;
  /** Where a jump lands: the node's parent (a port's: its node's), a hole's deepest scope holding all its users. */
  readonly scope: Scope;
  /** The breadcrumbs to scope. */
  readonly path: ScopeView["path"];
  /** The item scope draws for it: node:<index> (a port's node), tbd:<placeholder index>. */
  readonly key: string;
  /** The node, a port's node; null for a hole. */
  readonly node: number | null;
  /** A port's name, which its node's details mark; null for a node or hole. */
  readonly port: string | null;
}

export function mapScene(world: LoadedWorld): Scene;
export function scopeView(scene: Scene, scope: Scope): ScopeView;
export function detailsOf(node: NodeSpec): Details;
export function search(scene: Scene, query: string): Hit[];
export function lightsFor(scene: Scene, view: ScopeView, hits: readonly Hit[]): string[];
