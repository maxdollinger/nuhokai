import { type Dirent, existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { NodeRef, UnresolvedPortRef } from "@nuhokai/world";
import * as worldRuntime from "@nuhokai/world";
import type { Edge, NodeSpec, Port, UsesEdge } from "@nuhokai/world/node-spec";
import { CliError, oneLine } from "../shared/failure.ts";
import { inWorld, WORLD_GENERATED_DIR, WORLD_INDEX } from "../shared/paths.ts";

/** A `tbd` placeholder: no edge, because it has no target; one per tbd object, with every node that uses it. */
export interface Placeholder {
  readonly kind: "call" | "event";
  readonly description: string;
  /** Node ids, in the order the nodes first use it. */
  readonly users: string[];
}

/** One place a node is listed: in a dome's children, or in the world's (`parent` null). */
export interface Listing {
  readonly node: string;
  readonly parent: string | null;
}

/** An exported node the walk from the world never reaches. */
export interface Orphan {
  readonly id: string;
  readonly name: string;
  /** The defining file, else the first that exports it, named from the cwd. */
  readonly file: string;
}

/** Where a reachable node is defined: its file, named from the cwd, and the line of its node() call. */
export interface NodeFile {
  readonly node: string;
  readonly file: string;
  /** Absent when no frame of the node() call lies in the world. */
  readonly line?: number;
}

/** The world as plain data: what `map` draws and `check` judges. */
export interface LoadedWorld {
  /** The world's own id, as `defineWorld` holds it; per-world state is keyed by it. */
  readonly id: string;
  /** The world file, nuhokai/index.ts, named from the cwd: where findings about the world point. */
  readonly file: string;
  /** The world's name, as given; absent if it is no string. */
  readonly name?: string;
  /** The world's source, as given; absent if it is no list. */
  readonly source?: readonly unknown[];
  /** Depth-first from the world: a parent before its children, children in record order, each node once. */
  readonly nodes: NodeSpec[];
  /** Each node's parent as its position in `nodes`, null at the top level; aligned with `nodes`, unambiguous under duplicate ids. */
  readonly parents: (number | null)[];
  /** Ordered by first use. */
  readonly placeholders: Placeholder[];
  /** Every listing in walk order, a repeat included: what `nodes` drops, check reports. */
  readonly listings: Listing[];
  /** In sorted file order, each once. */
  readonly orphans: Orphan[];
  /** One per node, in `nodes` order. */
  readonly files: NodeFile[];
}

/** A node handle and what the loader learnt about it from the exports. */
interface Named {
  readonly name: string;
  /** The file that defines it, else the first that exports it, named from the cwd; errors about the node name this file. */
  readonly file: string;
}

/** A world file, evaluated: its path named from the cwd, and its exports. */
type Module = [file: string, exports: Record<string, unknown>];

/** The paths Bun may report for a world's files, which it loads by their real path. */
interface WorldPaths {
  /** The project directory as named from the cwd; every name starts with it. */
  readonly root: string;
  /** The world folder, absolute and as its real path. */
  readonly dirs: readonly string[];
  /** Each world file's real path to its name; a symlinked file's may lie outside the folder. */
  readonly files: ReadonlyMap<string, string>;
}

let runtimeRegistered = false;

/** Each handle a world file made, to the stack of its node() call: the first world frame is the file that defines it. */
const madeAt = new WeakMap<object, string>();

type Draft = { edges(edges: unknown): object };

/**
 * The runtime's node(), recording where each handle is made: module exports
 * cannot tell the file that defines a node from one that re-exports it.
 */
const tracedNode = ((def: unknown) => {
  const stack = new Error().stack ?? "";
  const draft = (worldRuntime.node as (def: unknown) => Draft)(def);
  return Object.freeze({
    ...draft,
    edges: (edges: unknown) => {
      const handle = draft.edges(edges);
      madeAt.set(handle, stack);
      return handle;
    },
  });
}) as typeof worldRuntime.node;

/**
 * Make `@nuhokai/world` in every world file the CLI's own runtime, the one this
 * module imports: one runtime per process, whatever nuhokai/tsconfig.json maps
 * the specifier to and whether the repo has node_modules. A virtual module wins
 * over tsconfig paths, in the bundle and in a compiled binary alike. Every other
 * import resolves as Bun resolves it; the CLI runs with --no-install, so an
 * unresolvable one is a load error, never an install. Registered once per process.
 */
function useCliWorldRuntime(): void {
  if (runtimeRegistered) return;
  runtimeRegistered = true;
  Bun.plugin({
    name: "nuhokai-world-runtime",
    setup(build) {
      build.module("@nuhokai/world", () => ({ exports: { ...worldRuntime, node: tracedNode }, loader: "object" }));
    },
  });
}

/** Every world file, from the world folder with `/` separators, sorted: all `.ts` but `.generated/`, `.d.ts` and tests. */
function worldFiles(root: string): string[] {
  const dir = inWorld(root);
  const isFile = (entry: Dirent) =>
    entry.isFile() ||
    (entry.isSymbolicLink() && statSync(join(entry.parentPath, entry.name), { throwIfNoEntry: false })?.isFile());
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => isFile(entry) && entry.name.endsWith(".ts"))
    .filter((entry) => !entry.name.endsWith(".d.ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .filter((path) => !path.startsWith(`${WORLD_GENERATED_DIR}/`))
    .sort();
}

/** Where the world at `root` and its files are, by every path Bun may report. */
function worldPaths(root: string, files: readonly string[]): WorldPaths {
  const dir = inWorld(root);
  return {
    root,
    dirs: [resolve(dir), realpathSync(dir)],
    files: new Map(files.map((file) => [realpathSync(inWorld(root, file)), inWorld(root, file)])),
  };
}

/** A path Bun reports, named from the cwd, or undefined outside the world. */
function nameIn(paths: WorldPaths, path: string): string | undefined {
  const dir = paths.dirs.find((candidate) => path.startsWith(`${candidate}${sep}`));
  return dir ? inWorld(paths.root, ...relative(dir, path).split(sep)) : paths.files.get(path);
}

/** A stack's frames, innermost first: each frame's path and line. */
function framesOf(stack: string): [path: string, line: number][] {
  const frames = stack.matchAll(/^\s*at (?:.*?\()?(.+?):(\d+):\d+\)?$/gm);
  return [...frames].map(([, path = "", line]) => [path, Number(line)]);
}

/**
 * Where a failed evaluation points, named from the cwd, with its line when known:
 * where a syntax or resolve error points, else the first stack frame inside the
 * world, else the file whose import did not resolve, else the file whose import
 * failed (an import of a throwing file fails with that file's error). A thrown
 * non-Error has no stack, so a file that throws one while imported by another is
 * blamed on that importer.
 */
function failingAt(error: unknown, paths: WorldPaths, imported: string): string {
  const at = (path: string | undefined, line: unknown) => {
    const name = path === undefined ? undefined : nameIn(paths, path);
    return name && typeof line === "number" && line > 0 ? `${name}:${line}` : name;
  };
  const position = (error as { position?: { file?: string; line?: number } } | null)?.position;
  const pointed = at(position?.file, position?.line);
  if (pointed) return pointed;
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  for (const [path, line] of framesOf(stack)) {
    const frame = at(path, line);
    if (frame) return frame;
  }
  return at((error as { referrer?: string } | null)?.referrer, undefined) ?? imported;
}

/** Evaluate every world file in sorted order; each answers its exports, keyed by its name. */
async function evaluate(root: string): Promise<{ modules: Module[]; paths: WorldPaths }> {
  const files = worldFiles(root);
  const paths = worldPaths(root, files);
  const modules: Module[] = [];
  useCliWorldRuntime();
  for (const path of files) {
    const file = inWorld(root, path);
    try {
      modules.push([file, (await import(pathToFileURL(resolve(file)).href)) as Record<string, unknown>]);
    } catch (error) {
      throw new CliError(`${failingAt(error, paths, file)}: ${oneLine(error)}`);
    }
  }
  return { modules, paths };
}

function isNode(value: unknown): value is NodeRef {
  return typeof value === "object" && value !== null && (value as { $ref?: unknown }).$ref === "node";
}

/** The world file whose node() call made the handle, named from the cwd, and the call's line: its first world frame. */
function madeIn(node: NodeRef, paths: WorldPaths): { file: string; line: number } | undefined {
  for (const [path, line] of framesOf(madeAt.get(node) ?? "")) {
    const file = nameIn(paths, path);
    if (file) return { file, line };
  }
  return undefined;
}

function definerOf(node: NodeRef, paths: WorldPaths): string | undefined {
  return madeIn(node, paths)?.file;
}

/**
 * Names from exports: an export of the file that defines the node wins over a
 * re-export, else the first export in sorted file order; `default` names nothing.
 */
function namesOf(modules: readonly Module[], paths: WorldPaths): Map<NodeRef, Named> {
  const names = new Map<NodeRef, Named>();
  const name = (definersOnly: boolean) => {
    for (const [file, exports] of modules) {
      for (const [exported, value] of Object.entries(exports)) {
        if (exported === "default" || !isNode(value) || names.has(value)) continue;
        const definer = definerOf(value, paths);
        if (!definersOnly || file === definer) names.set(value, { name: exported, file: definer ?? file });
      }
    }
  };
  name(true);
  name(false);
  return names;
}

/** The world's id, name, source and top-level nodes, from the default export of `index`, the entry point's name. */
function worldOf(
  modules: readonly Module[],
  index: string,
): { id: string; name?: string; source?: readonly unknown[]; children: readonly unknown[] } {
  const world = modules.find(([file]) => file === index)?.[1].default as
    | { $ref?: unknown; id?: unknown; name?: unknown; source?: unknown; children?: unknown }
    | undefined;
  if (world?.$ref !== "world" || typeof world.id !== "string" || !Array.isArray(world.children)) {
    throw new CliError(
      `${index}: the default export is not a world; export default defineWorld({ id: "...", name: "...", source: [...], children: [...] })`,
    );
  }
  // Name and source pass as given: judging them is check's.
  return {
    id: world.id,
    ...(typeof world.name === "string" ? { name: world.name } : {}),
    ...(Array.isArray(world.source) ? { source: world.source } : {}),
    children: world.children,
  };
}

/**
 * Turn evaluated world files into the LoadedWorld. Resolves every
 * reference by identity and judges nothing: ids, orphans, scope and names are
 * check's rules.
 */
function specsOf(modules: readonly Module[], paths: WorldPaths, index: string): LoadedWorld {
  const names = namesOf(modules, paths);
  const fileOf = (node: NodeRef | null) => (node && (names.get(node)?.file ?? definerOf(node, paths))) ?? index;
  const nameOf = (node: NodeRef) => names.get(node)?.name ?? node.$def.id;

  // Depth-first: a parent before its children, record order; the first listing places a node, every listing is kept.
  const placed: { node: NodeRef; parent: NodeRef | null }[] = [];
  const listings: Listing[] = [];
  const seen = new Set<NodeRef>();
  const place = (children: readonly unknown[], parent: NodeRef | null) => {
    for (const child of children) {
      if (!isNode(child)) {
        const owner = parent ? `${nameOf(parent)}'s children` : "the world's children";
        throw new CliError(`${fileOf(parent)}: ${owner} list a value that is not a node`);
      }
      listings.push({ node: child.$def.id, parent: parent ? parent.$def.id : null });
      if (seen.has(child)) continue;
      seen.add(child);
      placed.push({ node: child, parent });
      place(Object.values(child.$def.children ?? {}), child);
    }
  };
  const world = worldOf(modules, index);
  place(world.children, null);

  const placeholders = new Map<UnresolvedPortRef, Placeholder>();

  /** A lazy edge list, evaluated; a throwing function or a value that is no list is a load error about the node's file. */
  const edgeList = (node: NodeRef, edge: "uses" | "implements"): readonly unknown[] => {
    let list: unknown;
    try {
      list = node.$def[edge]?.() ?? [];
    } catch (error) {
      throw new CliError(`${fileOf(node)}: ${nameOf(node)}.${edge}: ${oneLine(error)}`);
    }
    if (!Array.isArray(list)) throw new CliError(`${fileOf(node)}: ${nameOf(node)}.${edge} does not return a list`);
    return list;
  };

  /** One uses edge per target node, listing every port used there; placeholders are recorded, not edges. */
  const usesOf = (node: NodeRef): UsesEdge[] => {
    const ports = new Map<NodeRef, string[]>();
    for (const ref of edgeList(node, "uses")) {
      const port = ref as { $ref?: unknown; node?: unknown; name?: unknown; port?: { name?: unknown } };
      if (port?.$ref === "unresolved") {
        const hole = ref as UnresolvedPortRef;
        let placeholder = placeholders.get(hole);
        if (!placeholder) {
          placeholder = { kind: hole.kind, description: hole.description, users: [] };
          placeholders.set(hole, placeholder);
        }
        if (!placeholder.users.includes(node.$def.id)) placeholder.users.push(node.$def.id);
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

  // Exported but never reached, in sorted file order: check's orphans.
  const orphans: Orphan[] = [];
  const orphaned = new Set<NodeRef>();
  for (const [, exports] of modules) {
    for (const value of Object.values(exports)) {
      if (!isNode(value) || seen.has(value) || orphaned.has(value)) continue;
      orphaned.add(value);
      orphans.push({ id: value.$def.id, name: nameOf(value), file: fileOf(value) });
    }
  }

  const files = placed.map(({ node }): NodeFile => {
    const made = madeIn(node, paths);
    return made && made.file === fileOf(node)
      ? { node: node.$def.id, file: made.file, line: made.line }
      : { node: node.$def.id, file: fileOf(node) };
  });

  const position = new Map(placed.map(({ node }, at) => [node, at]));
  const parents = placed.map(({ parent }) => (parent === null ? null : (position.get(parent) ?? null)));

  const { children: _children, ...head } = world;
  return { ...head, file: index, nodes, parents, placeholders: [...placeholders.values()], listings, orphans, files };
}

/**
 * Load the world at `root`, the project directory as named from the cwd: evaluate
 * every world file in-process and answer the world as its id, name, source,
 * NodeSpecs, parents, tbd placeholders, listings, orphans and node files. Writes, spawns and prompts nothing, and checks no rule. Every
 * failure is one CliError naming the file from the cwd.
 *
 * Once per root per process: Bun caches every evaluated module by its path, so
 * a second load of the same root answers the files as first evaluated.
 */
export async function loadWorld(root: string): Promise<LoadedWorld> {
  const index = inWorld(root, WORLD_INDEX);
  if (!existsSync(index)) throw new CliError(`${index}: not found; it is the world's entry point`);
  const { modules, paths } = await evaluate(root);
  return specsOf(modules, paths, index);
}
