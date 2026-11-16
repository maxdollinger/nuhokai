/** Types of scene.js, the map's scene logic; the page inlines the JS, so it stays plain JS. */
import type { NodeSpec } from "@nuhokai/world/node-spec";
import type { Placeholder } from "../load/load-world.ts";

/** The world as the map's data block holds it: only what the map draws, each node as its NodeSpec. */
export interface MapWorld {
  readonly id: string;
  readonly name?: string;
  readonly source?: readonly unknown[];
  readonly nodes: readonly NodeSpec[];
  readonly placeholders: readonly Placeholder[];
}

/** How complex a node is, in three steps: a score under 10 is simple, from 16 complex. */
export type ComplexityLevel = "simple" | "mid" | "complex";

/**
 * A node's complexity, estimated from its spec alone, one formula for leaves and domes: the sum of its parts. A dome
 * is one component at its own level: an edge between two nodes inside it does not count.
 */
export interface Complexity {
  readonly level: ComplexityLevel;
  readonly score: number;
  readonly parts: {
    /** The ports it offers, those inherited from contracts it implements among them. */
    readonly ports: number;
    /** The ports it, or a node inside it, uses outside itself, each once. */
    readonly uses: number;
    /** The tbd holes it, or a node inside it, uses. */
    readonly holes: number;
    /** Its requirements, those of contracts it implements among them. */
    readonly requirements: number;
    /** The nodes inside it, at every depth. */
    readonly inside: number;
  };
}

/** A scope: null for the top level, else the dome's position in `nodes`. */
export type Scope = number | null;

export interface Scene {
  readonly world: MapWorld;
  readonly nodes: readonly NodeSpec[];
  /** Each node's parent, by position; null at the top level. */
  readonly parents: readonly (number | null)[];
  readonly children: ReadonlyMap<Scope, readonly number[]>;
  /** The first node with each id. */
  readonly byId: ReadonlyMap<string, number>;
  /** Each node's complexity, by position; null for an external: it is not ours to build. */
  readonly complexity: readonly (Complexity | null)[];
}

/** A direct child of the scope, drawn as an island coloured by its complexity. */
export interface Island {
  readonly key: string;
  readonly kind: "island";
  readonly node: number;
  readonly name: string;
  readonly side: 0;
  readonly complexity: ComplexityLevel;
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
      /** The tbd's export name; null for an inline one. */
      readonly codeName: string | null;
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
  /** Its complexity, the parts in words (`1 port · 8 used ports · 17 requirements`); null for an external. */
  readonly complexity: { readonly level: ComplexityLevel; readonly score: number; readonly parts: string } | null;
  /** The node's deprecation note; null when it has none. */
  readonly deprecated: string | null;
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
  /** What the results list shows: the node's name, `Owner › port`, or `tbd name: description` (`tbd: description` unnamed). */
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

/** An item a query lights in one scope. */
export interface Light {
  readonly key: string;
  /** How many hits it stands for from inside it: a dome's nested nodes and their ports. */
  readonly inside: number;
}

export function mapScene(world: MapWorld): Scene;
export function scopeView(scene: Scene, scope: Scope): ScopeView;
export function detailsOf(scene: Scene, index: number): Details;
export function search(scene: Scene, query: string): Hit[];
export function lightsFor(scene: Scene, view: ScopeView, hits: readonly Hit[]): Light[];
