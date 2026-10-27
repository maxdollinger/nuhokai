import { type Dirent, existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { NodeRef, UnresolvedPortRef } from "@nuhokai/world";
import * as worldRuntime from "@nuhokai/world";
import type { Edge, NodeSpec, Port, UsesEdge } from "@nuhokai/world/node-spec";
import { CliError, oneLine } from "../shared/failure.ts";
import { fromRoot, inWorld, WORLD_DIR, WORLD_GENERATED_DIR, WORLD_INDEX } from "../shared/paths.ts";

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

/** A world file, evaluated: its from-root path and its exports. */
type Module = [file: string, exports: Record<string, unknown>];

/** The paths Bun may report for a world's files, which it loads by their real path. */
interface WorldPaths {
  /** The world folder, as given and as its real path. */
  readonly dirs: readonly string[];
  /** Each world file's real path to its from-root name; a symlinked file's may lie outside the folder. */
  readonly files: ReadonlyMap<string, string>;
}

const transpiler = new Bun.Transpiler({ loader: "ts" });

/** The worlds loaded in this process, by their folder's absolute path; the import guard covers their files. */
const guarded = new Map<string, WorldPaths>();
let runtimeRegistered = false;

/**
 * Make `@nuhokai/world` in every world file the CLI's own runtime, the one this
 * module imports: one runtime per process, whatever nuhokai/tsconfig.json maps
 * the specifier to and whether the repo has node_modules. A virtual module wins
 * over tsconfig paths, in the bundle and in a compiled binary alike.
 *
 * Every other import from a file in a guarded world must be relative and stay
 * inside it: Bun would install a bare specifier's package from the network and
 * run it, also from a file outside the world that a world file reached. So every
 * file a world reaches is a world file, and is guarded in turn. Registered once
 * per process; a file outside every guarded world loads unchanged.
 */
function useCliWorldRuntime(): void {
  if (runtimeRegistered) return;
  runtimeRegistered = true;
  Bun.plugin({
    name: "nuhokai-world-runtime",
    setup(build) {
      build.module("@nuhokai/world", () => ({ exports: { ...worldRuntime }, loader: "object" }));
      build.onLoad({ filter: /\.[jt]sx?$/ }, async ({ path }) => {
        const contents = await Bun.file(path).text();
        const paths = [...guarded.values()].find((world) => nameIn(world, path) !== undefined);
        if (paths) guardImports(paths, path, contents);
        return { contents, loader: extname(path).slice(1) as "ts" | "tsx" | "js" | "jsx" };
      });
    },
  });
}

/** Throw if the world file at `path` imports a package, or a file outside its world. */
function guardImports(paths: WorldPaths, path: string, contents: string): void {
  for (const specifier of importsOf(contents)) {
    if (specifier === "@nuhokai/world") continue;
    if (!/^[./]/.test(specifier)) {
      throw new CliError(
        `${nameIn(paths, path)}: imports are only relative files and @nuhokai/world, got '${specifier}'`,
      );
    }
    if (nameIn(paths, resolve(dirname(path), specifier)) === undefined) {
      throw new CliError(`${nameIn(paths, path)}: imports outside ${WORLD_DIR}/ are not allowed, got '${specifier}'`);
    }
  }
}

/** Every specifier a file imports, requires or dynamically imports by a literal; a syntax error is Bun's to report. */
function importsOf(contents: string): string[] {
  try {
    return transpiler.scanImports(contents).map((entry) => entry.path);
  } catch {
    return [];
  }
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
    dirs: [dir, realpathSync(dir)],
    files: new Map(files.map((file) => [realpathSync(inWorld(root, ...file.split("/"))), fromRoot(file)])),
  };
}

/** A path Bun reports, from the root, or undefined outside the world. */
function nameIn(paths: WorldPaths, path: string): string | undefined {
  const dir = paths.dirs.find((candidate) => path.startsWith(`${candidate}${sep}`));
  return dir ? fromRoot(...relative(dir, path).split(sep)) : paths.files.get(path);
}

/**
 * Where a failed evaluation points, from the root, with its line when known:
 * where a syntax or resolve error points, else the first stack frame inside the
 * world, else the file whose import failed (an import of a throwing file fails
 * with that file's error). A thrown non-Error has no stack, so a file that
 * throws one while imported by another is blamed on that importer.
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
  for (const match of stack.matchAll(/^\s*at (?:.*?\()?(.+?):(\d+):\d+\)?$/gm)) {
    const frame = at(match[1], Number(match[2]));
    if (frame) return frame;
  }
  return imported;
}

/** Evaluate every world file in sorted order; each answers its exports, keyed by its from-root path. */
async function evaluate(root: string): Promise<Module[]> {
  const files = worldFiles(root);
  const paths = worldPaths(root, files);
  const modules: Module[] = [];
  guarded.set(inWorld(root), paths);
  useCliWorldRuntime();
  for (const path of files) {
    const absolute = inWorld(root, ...path.split("/"));
    try {
      modules.push([fromRoot(path), (await import(pathToFileURL(absolute).href)) as Record<string, unknown>]);
    } catch (error) {
      // The import guard's error already names its file.
      if (error instanceof CliError) throw error;
      throw new CliError(`${failingAt(error, paths, fromRoot(path))}: ${oneLine(error)}`);
    }
  }
  return modules;
}

function isNode(value: unknown): value is NodeRef {
  return typeof value === "object" && value !== null && (value as { $ref?: unknown }).$ref === "node";
}

/** Names from exports: the first export in sorted file order wins; `default` names nothing. */
function namesOf(modules: readonly Module[]): Map<NodeRef, Named> {
  const names = new Map<NodeRef, Named>();
  for (const [file, exports] of modules) {
    for (const [name, value] of Object.entries(exports)) {
      if (name !== "default" && isNode(value) && !names.has(value)) names.set(value, { name, file });
    }
  }
  return names;
}

/** The world's top-level nodes, from the default export of index.ts. */
function topLevelOf(modules: readonly Module[]): readonly unknown[] {
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
function specsOf(modules: readonly Module[]): LoadedWorld {
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

  return { nodes, placeholders: [...placeholders.values()] };
}

/**
 * Load the world at `root`: evaluate every world file in-process and answer
 * the world as NodeSpecs plus its tbd placeholders. Writes, spawns and prompts
 * nothing, and checks no rule. Every failure is one CliError naming the file.
 *
 * Once per root per process: Bun caches every evaluated module by its path, so
 * a second load of the same root answers the files as first evaluated.
 */
export async function loadWorld(root: string): Promise<LoadedWorld> {
  if (!existsSync(inWorld(root, WORLD_INDEX))) {
    throw new CliError(`${fromRoot(WORLD_INDEX)}: not found; it is the world's entry point`);
  }
  return specsOf(await evaluate(root));
}
