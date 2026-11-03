/**
 * The world as plain data, read and never run: the CLI's pinned checker parses every world file and resolves each
 * name to its declaration, and the calls a world file may make (node, .edges, defineWorld, tbd.call, tbd.event,
 * inherited) are read as data. Nothing in a world file runs, so import cycles do not matter and the loader needs no
 * sandbox.
 *
 * It reads what TypeCheck R2 allows: literals, objects, arrays, spreads, string `+` and templates, `as const`,
 * consts, imports between world files, and arrow functions whose body is an expression or one `return`. Anything
 * else is a CliError at its file and line.
 */
import {
  type Dirent,
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  type Stats,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Edge, NodeSpec, Port, UsesEdge } from "@nuhokai/world/node-spec";
import type { SourceFile } from "typescript/unstable/ast";
import { checkerPath, withChecker } from "../check/type-check.ts";
import { CliError, errorLine, oneLine } from "../shared/failure.ts";
import { requireWorld } from "../shared/inspect.ts";
import { nameNodes } from "../shared/node-path.ts";
import { nameInWorld, WORLD_GENERATED_DIR, WORLD_INDEX } from "../shared/paths.ts";
import { Fn, HoleV, InheritedV, NodeV, PortV, plain, Reader, type Rec, type Val, WorldV } from "./reader.ts";

/** A `tbd` placeholder: no edge, because it has no target; one per tbd object, with every node that uses it. */
export interface Placeholder {
  readonly kind: "call" | "event";
  readonly description: string;
  /** Its export name, picked as a node's is; absent if no world file exports it (an inline tbd). */
  readonly name?: string;
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

/** A reachable node as loaded: its NodeSpec, where it sits in the hierarchy, and where it is defined. */
export interface LoadedNode {
  /** Its position in the world's `nodes`. */
  readonly index: number;
  readonly spec: NodeSpec;
  /** Its parent's position in `nodes`, null at the top level; unambiguous under duplicate ids. */
  readonly parent: number | null;
  /** Its direct children's positions in `nodes`, in list order. */
  readonly children: readonly number[];
  /** Its hierarchy path from the world, `Check/SpecCheck`, as NodePath names it: how every command names a node. */
  readonly path: string;
  /** Its defining file (R2), named from the cwd. */
  readonly file: string;
  /** The line of its node() call; absent when the defining file is not the one holding the call. */
  readonly line?: number;
}

/** The world as data: what `map` draws, `check` judges and `tree` prints. */
export interface LoadedWorld {
  /** The world's own id, as `defineWorld` holds it; per-world state is keyed by it. */
  readonly id: string;
  /** The world file, nuhokai/index.ts, named from the cwd: where findings about the world point. */
  readonly file: string;
  /** The world's name, as given; absent if it is no string. */
  readonly name?: string;
  /** The world's source, as given; absent if it is no list. */
  readonly source?: readonly unknown[];
  /** Depth-first from the world: a parent before its children, children in list order, each node once. */
  readonly nodes: readonly LoadedNode[];
  /** The top-level nodes' positions in `nodes`, in the world's list order. */
  readonly top: readonly number[];
  /** Ordered by first use. */
  readonly placeholders: Placeholder[];
  /** Every listing in walk order, a repeat included: what `nodes` drops, check reports. */
  readonly listings: Listing[];
  /** In sorted file order, each once. */
  readonly orphans: Orphan[];
}

/**
 * Every world file, from the world folder with `/` separators, sorted: all `.ts` but `.generated/`, `.d.ts` and tests.
 * Symlinks are followed, but never into a directory already on the way down, so a symlink loop is walked once; a
 * link that cannot be resolved at all is a load error naming it.
 */
export function worldFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string, path: string, above: ReadonlySet<string>) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = path ? `${path}/${entry.name}` : entry.name;
      const at = join(dir, entry.name);
      let kind: Stats | Dirent | undefined = entry;
      if (entry.isSymbolicLink()) {
        try {
          kind = statSync(at, { throwIfNoEntry: false });
        } catch (error) {
          const code = (error as { code?: unknown } | null)?.code;
          throw new CliError(
            `${nameInWorld(root, name)}: the symlink cannot be resolved (${String(code ?? errorLine(error))})`,
          );
        }
      }
      if (kind?.isDirectory()) {
        const real = realpathSync(at);
        if (name !== WORLD_GENERATED_DIR && !above.has(real)) walk(at, name, new Set([...above, real]));
      } else if (kind?.isFile() && name.endsWith(".ts") && !name.endsWith(".d.ts") && !name.endsWith(".test.ts")) {
        files.push(name);
      }
    }
  };
  const dir = nameInWorld(root);
  walk(dir, "", new Set([realpathSync(dir)]));
  return files.sort();
}

/** What the loader's own project needs: the files parsed and their imports resolved, nothing type-checked. */
const READ_OPTIONS = {
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "bundler",
  allowImportingTsExtensions: true,
  noEmit: true,
  noLib: true,
  types: [],
};

/**
 * Load the world at `root`, the project directory as named from the cwd: read every world file with the pinned
 * checker and nuhokai/tsconfig.json, and answer the world as its id, name, source, nodes (each with its
 * NodeSpec, place in the hierarchy and defining file), tbd placeholders, listings and orphans. Runs, writes and prompts nothing, and checks no rule. Every failure
 * is one CliError naming the file from the cwd. `checker` finds the checker, as for TypeCheck.
 */
export async function loadWorld(root: string, checker: () => string = checkerPath): Promise<LoadedWorld> {
  // No world, or something else at nuhokai/: the same error every command gives, naming init.
  requireWorld(root);
  const index = nameInWorld(root, WORLD_INDEX);
  if (!existsSync(index)) throw new CliError(`${index}: not found; it is the world's entry point`);
  const paths = worldFiles(root).map((path) => nameInWorld(root, path));
  const names = new Map<string, string>();
  for (const name of paths) {
    names.set(resolve(name), name);
    names.set(realpathSync(name), name);
  }

  // The loader's own project: exactly the world files, no lib, whatever nuhokai/tsconfig.json says or whether it is
  // there. Reading needs only the files parsed and their names resolved; type-checking is TypeCheck's.
  const projectDir = mkdtempSync(join(tmpdir(), "nuhokai-load-"));
  const config = join(projectDir, "tsconfig.json");
  writeFileSync(config, JSON.stringify({ compilerOptions: READ_OPTIONS, files: paths.map((name) => resolve(name)) }));
  try {
    return await withChecker(root, config, nameInWorld(root), checker(), async (project) => {
      const program = project.program;
      const files = await Promise.all(
        paths.map(async (name): Promise<[string, SourceFile]> => {
          const file =
            (await program.getSourceFile(resolve(name))) ?? (await program.getSourceFile(realpathSync(name)));
          if (!file) throw new CliError(`${name}: the type checker did not read it`);
          return [name, file];
        }),
      );
      // A file that does not parse is a load error at its first syntax error.
      const syntax = await Promise.all(files.map(([, file]) => program.getSyntacticDiagnostics(file.fileName)));
      for (const [at, [name, file]] of files.entries()) {
        const first = syntax[at]?.[0];
        if (first) {
          const line = file.getLineAndCharacterOfPosition(first.pos).line + 1;
          throw new CliError(`${name}:${line}: ${oneLine(first.text)}`);
        }
      }
      const reader = new Reader(project, names);
      await reader.prepare(files.map(([, file]) => file));
      for (const [, file] of files) await reader.readStatements(file);
      return worldOf(reader, files, index);
    });
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

/** What the exports say about a node or hole (R2): its name, and the file errors about it name. */
interface Named {
  readonly name: string;
  readonly file: string;
}

/** Each world file's exports, in sorted file order. */
type Modules = readonly (readonly [file: string, exports: readonly [string, Val][]])[];

/** What building the world needs at every step: the reader, the world file, and the export names of nodes and holes. */
interface Context {
  readonly reader: Reader;
  /** The world file, named from the cwd. */
  readonly index: string;
  readonly nodes: ReadonlyMap<NodeV, Named>;
  readonly holes: ReadonlyMap<HoleV, Named>;
}

/** A node as the walk placed it, under its parent (null at the top level). */
interface Placed {
  readonly node: NodeV;
  readonly parent: NodeV | null;
}

/** R2: each value `is` picks, named by the defining file's export, else the first export in sorted file order. */
function namesOf<T extends NodeV | HoleV>(modules: Modules, is: (value: Val) => value is T): Map<T, Named> {
  const named = new Map<T, Named>();
  for (const definersOnly of [true, false]) {
    for (const [file, exports] of modules) {
      for (const [exported, value] of exports) {
        if (exported === "default" || !is(value) || named.has(value)) continue;
        if (!definersOnly || file === value.at.file) named.set(value, { name: exported, file: value.at.file });
      }
    }
  }
  return named;
}

/** The file errors about a node name (R2); the world file for the world itself. */
function fileOf(context: Context, node: NodeV | null): string {
  return node ? (context.nodes.get(node)?.file ?? node.at.file) : context.index;
}

/** A node's name: its export name (R2), else its id. */
function nameOf(context: Context, node: NodeV): string {
  return context.nodes.get(node)?.name ?? node.id;
}

/** R6: index.ts's default export, which must be a world with a string id and a list of children. */
function worldIn(modules: Modules, index: string): { def: Rec; id: string; children: readonly Val[] } {
  const world = modules.find(([file]) => file === index)?.[1].find(([exported]) => exported === "default")?.[1];
  if (!(world instanceof WorldV) || typeof world.def.id !== "string" || !Array.isArray(world.def.children)) {
    throw new CliError(
      `${index}: the default export is not a world; export default defineWorld({ id: "...", name: "...", source: [...], children: [...] })`,
    );
  }
  return { def: world.def, id: world.def.id, children: world.def.children };
}

/** R3, R7: depth-first from the world's children, a parent before its children, list order; every listing kept. */
async function walk(context: Context, top: readonly Val[]): Promise<{ placed: Placed[]; listings: Listing[] }> {
  const placed: Placed[] = [];
  const listings: Listing[] = [];
  const seen = new Set<NodeV>();
  const place = async (children: readonly Val[], parent: NodeV | null): Promise<void> => {
    for (const child of children) {
      if (!(child instanceof NodeV)) {
        const owner = parent ? `${nameOf(context, parent)}'s children` : "the world's children";
        throw new CliError(`${fileOf(context, parent)}: ${owner} list a value that is not a node`);
      }
      listings.push({ node: child.id, parent: parent ? parent.id : null });
      if (seen.has(child)) continue;
      seen.add(child);
      placed.push({ node: child, parent });
      await place(context.reader.childrenOf(child), child);
    }
  };
  await place(top, null);
  return { placed, listings };
}

/** A lazy part of a node, read; a failure is a load error about the node's file, as the loader words it. */
async function lazily<T>(context: Context, node: NodeV, field: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof CliError && /^\S+:\d+: /.test(error.message)) throw error;
    throw new CliError(`${fileOf(context, node)}: ${nameOf(context, node)}.${field}: ${errorLine(error)}`);
  }
}

/** A node's uses or implements list, read from either step: an edge may sit in node() or in .edges(). */
async function edgeList(context: Context, node: NodeV, edge: "uses" | "implements"): Promise<readonly Val[]> {
  const fn = { ...node.def, ...node.edges }[edge];
  if (fn === undefined) return [];
  const read = () => (fn instanceof Fn ? context.reader.apply(fn, []) : Promise.resolve(fn));
  const list = await lazily(context, node, edge, read);
  if (!Array.isArray(list)) {
    throw new CliError(`${fileOf(context, node)}: ${nameOf(context, node)}.${edge} does not return a list`);
  }
  return list;
}

/** A node's uses edges, one per target with its ports in first-use order; a tbd it uses joins its placeholder (R4). */
async function usesOf(context: Context, node: NodeV, placeholders: Map<HoleV, Placeholder>): Promise<UsesEdge[]> {
  const ports = new Map<NodeV, string[]>();
  for (const ref of await edgeList(context, node, "uses")) {
    if (ref instanceof HoleV) {
      let placeholder = placeholders.get(ref);
      if (!placeholder) {
        const name = context.holes.get(ref)?.name;
        const description = ref.description as string;
        placeholder = { kind: ref.kind, description, ...(name && { name }), users: [] };
        placeholders.set(ref, placeholder);
      }
      if (!placeholder.users.includes(node.id)) placeholder.users.push(node.id);
      continue;
    }
    // An inherited port is the implementor's: the edge goes to it, under the contract's port name.
    const target = ref instanceof PortV ? ref.node : ref instanceof InheritedV ? ref.node : undefined;
    const port = ref instanceof PortV ? ref : ref instanceof InheritedV ? ref.port : undefined;
    const owns =
      ref instanceof PortV && target instanceof NodeV
        ? Object.hasOwn(await lazily(context, target, "ports", () => context.reader.portsOf(target)), ref.name)
        : port instanceof PortV;
    if (!(target instanceof NodeV) || !(port instanceof PortV) || !owns) {
      throw new CliError(
        `${fileOf(context, node)}: ${nameOf(context, node)}.uses lists a value that is not a port reference`,
      );
    }
    const used = ports.get(target) ?? [];
    if (!used.includes(port.name)) used.push(port.name);
    ports.set(target, used);
  }
  return [...ports].map(([target, port]) => ({ kind: "uses", to: target.id, port }));
}

/** A node's implements edges, one per contract listed. */
async function implementsOf(context: Context, node: NodeV): Promise<Edge[]> {
  return (await edgeList(context, node, "implements")).map((contract) => {
    if (!(contract instanceof NodeV)) {
      throw new CliError(
        `${fileOf(context, node)}: ${nameOf(context, node)}.implements lists a value that is not a node`,
      );
    }
    return { kind: "implements", to: contract.id };
  });
}

/** A placed node's NodeSpec (R2): its fields as plain data, its ports resolved, then its uses and implements edges. */
async function specOf(
  context: Context,
  { node, parent }: Placed,
  placeholders: Map<HoleV, Placeholder>,
): Promise<NodeSpec> {
  const {
    id,
    external,
    abstract,
    ports: _ports,
    children: _children,
    implements: _implements,
    uses: _uses,
    ...rest
  } = { ...node.def, ...node.edges };
  const fields = plain(rest, fileOf(context, node)) as Record<string, unknown>;
  const spec = {
    schema: "nuhokai/node@1",
    id,
    name: nameOf(context, node),
    parent: parent ? parent.id : null,
    external: external ?? false,
    abstract: abstract ?? false,
    ...(fields as Omit<NodeSpec, "schema" | "id" | "name" | "parent" | "external" | "abstract">),
  } as NodeSpec;
  if (node.def.ports !== undefined) {
    const ports = await lazily(context, node, "ports", () => context.reader.portsOf(node));
    spec.ports = Object.entries(ports).map(
      ([name, port]) => ({ name, ...(plain(port, fileOf(context, node)) as object) }) as Port,
    );
  }
  const edges = [...(await usesOf(context, node, placeholders)), ...(await implementsOf(context, node))];
  if (edges.length) spec.edges = edges;
  return spec;
}

/** R8: exported but never reached, in sorted file order, each once. */
function orphansOf(context: Context, modules: Modules, reached: ReadonlySet<NodeV>): Orphan[] {
  const orphans: Orphan[] = [];
  const orphaned = new Set<NodeV>();
  for (const [, exports] of modules) {
    for (const [, value] of exports) {
      if (!(value instanceof NodeV) || reached.has(value) || orphaned.has(value)) continue;
      orphaned.add(value);
      orphans.push({ id: value.id, name: nameOf(context, value), file: fileOf(context, value) });
    }
  }
  return orphans;
}

/** The LoadedWorld from the read files (LoadWorld R2–R10). */
async function worldOf(reader: Reader, sources: readonly [string, SourceFile][], index: string): Promise<LoadedWorld> {
  const modules: [string, [string, Val][]][] = [];
  for (const [name, file] of sources) modules.push([name, await reader.exportsOf(file)]);
  const context: Context = {
    reader,
    index,
    nodes: namesOf(modules, (value): value is NodeV => value instanceof NodeV),
    holes: namesOf(modules, (value): value is HoleV => value instanceof HoleV),
  };
  const world = worldIn(modules, index);
  const { placed, listings } = await walk(context, world.children);

  // R10: parents by position, so duplicate ids cannot misplace a node; children and paths from them.
  const position = new Map(placed.map(({ node }, at) => [node, at]));
  const parents = placed.map(({ parent }) => (parent === null ? null : (position.get(parent) ?? null)));
  const paths = nameNodes(placed.map(({ node }, at) => ({ name: nameOf(context, node), parent: parents[at] ?? null })));
  const top: number[] = [];
  const children = placed.map((): number[] => []);
  parents.forEach((parent, at) => {
    (parent === null ? top : (children[parent] ?? [])).push(at);
  });

  const placeholders = new Map<HoleV, Placeholder>();
  const nodes: LoadedNode[] = [];
  for (const [at, entry] of placed.entries()) {
    // R9: the defining file, and the line of the node() call when that file holds it.
    const file = fileOf(context, entry.node);
    nodes.push({
      index: at,
      spec: await specOf(context, entry, placeholders),
      parent: parents[at] ?? null,
      children: children[at] ?? [],
      path: paths[at] ?? "",
      file,
      ...(entry.node.at.file === file ? { line: entry.node.at.line } : {}),
    });
  }

  // Every node is read whole, also an orphan: its edges, and a dome's ports with their check, so a broken node is a
  // load error whether or not the world lists it.
  const reached = new Set(position.keys());
  for (const node of reader.nodes()) {
    if (reached.has(node)) continue;
    await edgeList(context, node, "uses");
    await edgeList(context, node, "implements");
    if (node.def.ports !== undefined) await lazily(context, node, "ports", () => reader.portsOf(node));
  }

  return {
    id: world.id,
    ...(typeof world.def.name === "string" ? { name: world.def.name } : {}),
    ...(Array.isArray(world.def.source) ? { source: plain(world.def.source, index) as unknown[] } : {}),
    file: index,
    nodes,
    top,
    placeholders: [...placeholders.values()],
    listings,
    orphans: orphansOf(context, modules, reached),
  };
}
