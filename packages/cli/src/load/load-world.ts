import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { NodeRef, UnresolvedPortRef } from "@nuhokai/world";
import * as worldRuntime from "@nuhokai/world";
import type { Edge, NodeSpec, Port, UsesEdge } from "@nuhokai/world/node-spec";
import { CliError, oneLine } from "../shared/failure.ts";
import { fromRoot, inWorld, WORLD_GENERATED_DIR, WORLD_INDEX } from "../shared/paths.ts";

/** A `tbd` placeholder: no edge, because it has no target; one per tbd object, with every node that uses it. */
export interface Placeholder {
  readonly kind: "call" | "event";
  readonly description: string;
  /** Node ids, in the order the nodes first use it. */
  readonly users: string[];
}

/** The world as plain data: what `map` draws and `check` will judge. */
export interface LoadedWorld {
  /** Depth-first from the world: a parent before its children, children in record order, each node once. */
  readonly nodes: NodeSpec[];
  /** Ordered by first use. */
  readonly placeholders: Placeholder[];
}

/** A node handle and what the loader learnt about it from the exports. */
interface Named {
  readonly name: string;
  /** The from-root file that first exports it; errors about the node name this file. */
  readonly file: string;
}

let runtimeRegistered = false;

/**
 * Make `@nuhokai/world` in every world file the CLI's own runtime, the one this
 * module imports: one runtime per process, whatever nuhokai/tsconfig.json maps
 * the specifier to and whether the repo has node_modules. A virtual module wins
 * over tsconfig paths, in the bundle and in a compiled binary alike.
 */
function useCliWorldRuntime(): void {
  if (runtimeRegistered) return;
  Bun.plugin({
    name: "nuhokai-world-runtime",
    setup(build) {
      build.module("@nuhokai/world", () => ({ exports: { ...worldRuntime }, loader: "object" }));
    },
  });
  runtimeRegistered = true;
}

/** Every world file, from the world folder with `/` separators, sorted: all `.ts` but `.generated/`, `.d.ts` and tests. */
function worldFiles(root: string): string[] {
  const dir = inWorld(root);
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .filter((entry) => !entry.name.endsWith(".d.ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .filter((path) => !path.startsWith(`${WORLD_GENERATED_DIR}/`))
    .sort();
}

/**
 * The world file a failed evaluation is about: where a syntax or resolve error
 * points, else the first stack frame inside the world, else the file whose
 * import failed (an import of a throwing file fails with that file's error).
 */
function failingFile(error: unknown, worldDirs: readonly string[], imported: string): string {
  const inside = (path: string | undefined): path is string =>
    path !== undefined && worldDirs.some((dir) => path.startsWith(`${dir}${sep}`));
  const position = (error as { position?: { file?: string } } | null)?.position?.file;
  if (inside(position)) return position;
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  for (const match of stack.matchAll(/^\s*at (?:.*?\()?(.+?):\d+:\d+\)?$/gm)) {
    if (inside(match[1])) return match[1];
  }
  return imported;
}

/** Evaluate every world file in sorted order; each answers its exports, keyed by its from-root path. */
async function evaluate(root: string): Promise<[file: string, exports: Record<string, unknown>][]> {
  const dir = inWorld(root);
  const worldDirs = [dir, realpathSync(dir)];
  const modules: [string, Record<string, unknown>][] = [];
  useCliWorldRuntime();
  for (const path of worldFiles(root)) {
    const absolute = inWorld(root, ...path.split("/"));
    try {
      modules.push([fromRoot(path), (await import(pathToFileURL(absolute).href)) as Record<string, unknown>]);
    } catch (error) {
      const file = failingFile(error, worldDirs, absolute);
      const worldDir = worldDirs.find((candidate) => file.startsWith(`${candidate}${sep}`)) ?? dir;
      throw new CliError(`${fromRoot(...relative(worldDir, file).split(sep))}: ${oneLine(error)}`);
    }
  }
  return modules;
}

function isNode(value: unknown): value is NodeRef {
  return typeof value === "object" && value !== null && (value as { $ref?: unknown }).$ref === "node";
}

/** Names from exports: the first export in sorted file order wins; `default` names nothing. */
function namesOf(modules: readonly [string, Record<string, unknown>][]): Map<NodeRef, Named> {
  const names = new Map<NodeRef, Named>();
  for (const [file, exports] of modules) {
    for (const [name, value] of Object.entries(exports)) {
      if (name !== "default" && isNode(value) && !names.has(value)) names.set(value, { name, file });
    }
  }
  return names;
}

/** The world's top-level nodes, from the default export of index.ts. */
function topLevelOf(modules: readonly [string, Record<string, unknown>][]): readonly unknown[] {
  const index = fromRoot(WORLD_INDEX);
  const world = modules.find(([file]) => file === index)?.[1].default as { $ref?: unknown; children?: unknown };
  if (world?.$ref !== "world" || !Array.isArray(world.children)) {
    throw new CliError(`${index}: the default export is not a world; export default defineWorld({ children: [...] })`);
  }
  return world.children;
}

/**
 * Turn evaluated world files into NodeSpecs and placeholders. Resolves every
 * reference by identity and judges nothing: ids, orphans, scope and names are
 * check's rules.
 */
function specsOf(modules: readonly [string, Record<string, unknown>][]): LoadedWorld {
  const names = namesOf(modules);
  const index = fromRoot(WORLD_INDEX);
  const fileOf = (node: NodeRef | null) => (node && names.get(node)?.file) ?? index;
  const nameOf = (node: NodeRef) => names.get(node)?.name ?? node.$def.id;

  // Depth-first: a parent before its children, record order; the first listing places a node.
  const placed: { node: NodeRef; parent: NodeRef | null }[] = [];
  const seen = new Set<NodeRef>();
  const place = (children: readonly unknown[], parent: NodeRef | null) => {
    for (const child of children) {
      if (!isNode(child)) {
        const owner = parent ? `${nameOf(parent)}'s children` : "the world's children";
        throw new CliError(`${fileOf(parent)}: ${owner} list a value that is not a node`);
      }
      if (seen.has(child)) continue;
      seen.add(child);
      placed.push({ node: child, parent });
      place(Object.values(child.$def.children ?? {}), child);
    }
  };
  place(topLevelOf(modules), null);

  const placeholders = new Map<UnresolvedPortRef, Placeholder>();

  /** A lazy edge list, evaluated; a throwing function is a load error about the node's file. */
  const edgeList = (node: NodeRef, edge: "uses" | "implements"): readonly unknown[] => {
    try {
      return node.$def[edge]?.() ?? [];
    } catch (error) {
      throw new CliError(`${fileOf(node)}: ${nameOf(node)}.${edge}: ${oneLine(error)}`);
    }
  };

  /** One uses edge per target node, listing every port used there; placeholders are recorded, not edges. */
  const usesOf = (node: NodeRef): UsesEdge[] => {
    const ports = new Map<NodeRef, string[]>();
    for (const ref of edgeList(node, "uses")) {
      const port = ref as { $ref?: unknown; node?: unknown; name?: unknown; port?: { name?: unknown } };
      if (port?.$ref === "unresolved") {
        const hole = ref as UnresolvedPortRef;
        const placeholder = placeholders.get(hole) ?? { kind: hole.kind, description: hole.description, users: [] };
        if (!placeholder.users.includes(node.$def.id)) placeholder.users.push(node.$def.id);
        placeholders.set(hole, placeholder);
        continue;
      }
      // An inherited port is the implementor's: the edge goes to it, under the contract's port name.
      const name = port?.$ref === "port" ? port.name : port?.$ref === "inherited" ? port.port?.name : undefined;
      if (!isNode(port?.node) || typeof name !== "string") {
        throw new CliError(`${fileOf(node)}: ${nameOf(node)}.uses lists a value that is not a port reference`);
      }
      const used = ports.get(port.node) ?? [];
      if (!used.includes(name)) used.push(name);
      ports.set(port.node, used);
    }
    return [...ports].map(([target, port]) => ({ kind: "uses", to: target.$def.id, port }));
  };

  const implementsOf = (node: NodeRef): Edge[] =>
    edgeList(node, "implements").map((contract) => {
      if (!isNode(contract)) {
        throw new CliError(`${fileOf(node)}: ${nameOf(node)}.implements lists a value that is not a node`);
      }
      return { kind: "implements", to: contract.$def.id };
    });

  const nodes = placed.map(({ node, parent }): NodeSpec => {
    const {
      id,
      external,
      abstract,
      ports,
      children: _children,
      implements: _implements,
      uses: _uses,
      ...fields
    } = node.$def;
    const spec = {
      schema: "nuhokai/node@1",
      id,
      name: nameOf(node),
      parent: parent ? parent.$def.id : null,
      external: external ?? false,
      abstract: abstract ?? false,
      // The stored fields are the NodeSpec fields as authored, deep-frozen.
      ...(fields as Omit<NodeSpec, "schema" | "id" | "name" | "parent" | "external" | "abstract">),
    } satisfies NodeSpec as NodeSpec;
    // A dome's stored ports already carry their delegate.
    if (ports) spec.ports = Object.entries(ports).map(([name, port]) => ({ name, ...port }) as Port);
    const edges = [...usesOf(node), ...implementsOf(node)];
    if (edges.length) spec.edges = edges;
    return spec;
  });

  return { nodes, placeholders: [...placeholders.values()] };
}

/**
 * Load the world at `root`: evaluate every world file in-process and answer
 * the world as NodeSpecs plus its tbd placeholders. Writes, spawns and prompts
 * nothing, and checks no rule. Every failure is one CliError naming the file.
 */
export async function loadWorld(root: string): Promise<LoadedWorld> {
  if (!existsSync(inWorld(root, WORLD_INDEX))) {
    throw new CliError(`${fromRoot(WORLD_INDEX)}: not found; it is the world's entry point`);
  }
  return specsOf(await evaluate(root));
}
