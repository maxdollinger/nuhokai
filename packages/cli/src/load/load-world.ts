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
import { type Dirent, existsSync, readdirSync, realpathSync, type Stats, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Edge, NodeSpec, Port, UsesEdge } from "@nuhokai/world/node-spec";
import type { SourceFile } from "typescript/unstable/ast";
import { checkerPath, withChecker } from "../shared/checker-client.ts";
import type { Finding } from "../shared/diagnostics.ts";
import { errorLine, oneLine } from "../shared/failure.ts";
import { requireWorld } from "../shared/inspect.ts";
import { nameNodes } from "../shared/node-path.ts";
import { isInside, nameInWorld, WORLD_GENERATED_DIR, WORLD_INDEX } from "../shared/world-path.ts";
import {
  type At,
  type Export,
  Fn,
  InheritedV,
  type Line,
  LoadError,
  NodeV,
  PlaceholderV,
  PortV,
  plain,
  positionIn,
  Reader,
  type Rec,
  type SourcePlaces,
  type Val,
  valueInWords,
  WorldV,
} from "./reader.ts";
import { SpecShape } from "./spec-shape.ts";

export { type Line, LoadError, type SourcePlaces };

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
  /** The file the list was written in: its owner's node() or defineWorld call's. */
  readonly file: string;
  /** The line the item was written on in `file` (or the `...spread` that brought it in), when it is there. */
  readonly line?: number;
}

/** An exported node the walk from the world never reaches. */
export interface Orphan {
  readonly id: string;
  readonly name: string;
  /** The defining file, else the first that exports it, named from the cwd. */
  readonly file: string;
  /** Its node() call's line, when that call is in `file`. */
  readonly line?: number;
}

/**
 * Where each spec item was written in the node's file (R15), by line: the purpose, and one entry per port,
 * requirement, test case, decision and uses edge, in the NodeSpec's order (an edge at its first item); a spread-in
 * item at its `...spread`. An entry is undefined where the item was written in another file.
 */
export interface SpecPlaces {
  readonly purpose?: number;
  readonly ports: readonly (number | undefined)[];
  readonly requirements: readonly (number | undefined)[];
  readonly testCases: readonly (number | undefined)[];
  readonly decisions: readonly (number | undefined)[];
  readonly uses: readonly (number | undefined)[];
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
  /**
   * Its uses edges' targets by position, in its edges' order: `uses[i]` is `spec.edges[i]`'s, as uses edges come
   * first; null for one the walk never reaches, an orphan (R14).
   */
  readonly uses: readonly (number | null)[];
  /** Its implements edges' contracts by position, in its edges' order; null for one the walk never reaches (R14). */
  readonly contracts: readonly (number | null)[];
  /** Its hierarchy path from the world, `Check/SpecCheck`, as NodePath names it: how every command names a node. */
  readonly path: string;
  /** Its defining file (R2), named from the cwd. */
  readonly file: string;
  /** The line of its node() call; absent when the defining file is not the one holding the call. */
  readonly line?: number;
  /** Where its source and each entry were written in `file`, when it holds the call. */
  readonly source?: SourcePlaces;
  /** Where each spec item was written in `file`, when it holds the call (R15). */
  readonly places?: SpecPlaces;
  /**
   * The spec's fields the loader replaced because they had the wrong shape (R16), such as `source` when it was no
   * list; the world's `problems` say why. Absent when it replaced none.
   */
  readonly reshaped?: readonly ShapedField[];
}

/** The NodeSpec fields whose shape the loader judges (R16). */
export type ShapedField = "source" | "purpose" | "requirements" | "testCases" | "decisions";

/** The world as data: what `map` draws, `check` judges and `tree` prints. */
export interface LoadedWorld {
  /** The world's own id, as `defineWorld` holds it; per-world state is keyed by it. */
  readonly id: string;
  /** The world file, nuhokai/index.ts, named from the cwd: where findings about the world point. */
  readonly file: string;
  /**
   * The file holding the defineWorld call, named from the cwd: `file` itself, or a world file it re-exports the
   * world from. Findings about the world's own fields point here, at `line`.
   */
  readonly definedIn: string;
  /** The defineWorld call's line in `definedIn`. */
  readonly line?: number;
  /** Where the world's source and each of its entries were written in `definedIn`, when it has a source. */
  readonly sourcePlaces?: SourcePlaces;
  /** The world's name, as given; absent if it is no string. */
  readonly name?: string;
  /** The world's source, its string entries as given; absent if it is no list (R16). */
  readonly source?: readonly string[];
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
  /**
   * Every field of the world or a node the loader replaced because its shape was wrong (R16): one error finding each,
   * at the field or item, naming the node. Check reports them; every other reader gets well-shaped data.
   */
  readonly problems: readonly Finding[];
}

/**
 * Every world file, from the world folder with `/` separators, sorted: all `.ts` but `.generated/`, `.d.ts` and tests.
 * Symlinks are followed, but never into a directory already on the way down, so a symlink loop is walked once; a
 * link that cannot be resolved, or that leads outside the project directory and the world folder, is a load error
 * naming it.
 */
function worldFiles(root: string): string[] {
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
          throw new LoadError(
            nameInWorld(root, name),
            undefined,
            `the symlink cannot be resolved (${String(code ?? errorLine(error))})`,
          );
        }
        // A world reads only what the project holds: a link out of it would pull any .ts on the machine into output.
        const real = kind ? realpathSync(at) : undefined;
        if (real !== undefined && !inside.some((boundary) => isInside(real, boundary))) {
          throw new LoadError(
            nameInWorld(root, name),
            undefined,
            "the symlink leads outside the project directory; a world reads only files inside it",
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
  // nuhokai/ may itself be a symlink to a directory (Inspect): what lies under it is the world's too.
  const inside = [realpathSync(root), realpathSync(dir)];
  walk(dir, "", new Set([realpathSync(dir)]));
  return files.sort();
}

/** The loader's own tsconfig, in the world folder but only in the checker's memory: never written, so never in the way. */
const LOADER_TSCONFIG = ".nuhokai-load.tsconfig.json";

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
  const worldFile = nameInWorld(root, WORLD_INDEX);
  if (!existsSync(worldFile)) throw new LoadError(worldFile, undefined, "not found; it is the world's entry point");
  const paths = worldFiles(root).map((path) => nameInWorld(root, path));
  const names = new Map<string, string>();
  for (const name of paths) {
    names.set(resolve(name), name);
    names.set(realpathSync(name), name);
  }

  // The loader's own project: exactly the world files, no lib, whatever nuhokai/tsconfig.json says or whether it is
  // there. Reading needs only the files parsed and their names resolved; type-checking is TypeCheck's. The checker
  // reads its tsconfig from memory, so nothing is written, in the project or elsewhere, and nothing is left behind.
  const config = resolve(nameInWorld(root), LOADER_TSCONFIG);
  const virtual = new Map([
    [config, JSON.stringify({ compilerOptions: READ_OPTIONS, files: paths.map((name) => resolve(name)) })],
  ]);
  return withChecker({ root, config, name: nameInWorld(root), checker: checker(), virtual }, async (project) => {
    const program = project.program;
    const files = await Promise.all(
      paths.map(async (name): Promise<[string, SourceFile]> => {
        const file = (await program.getSourceFile(resolve(name))) ?? (await program.getSourceFile(realpathSync(name)));
        if (!file) throw new LoadError(name, undefined, "the type checker did not read it");
        return [name, file];
      }),
    );
    // A file that does not parse is a load error at its first syntax error.
    const syntax = await Promise.all(files.map(([, file]) => program.getSyntacticDiagnostics(file.fileName)));
    for (const [at, [name, file]] of files.entries()) {
      const first = syntax[at]?.[0];
      if (first) throw new LoadError(name, positionIn(file, first.pos), oneLine(first.text));
    }
    const reader = new Reader(project, names);
    await reader.prepare(files.map(([, file]) => file));
    for (const [, file] of files) await reader.readStatements(file);
    return worldOf(reader, files, worldFile);
  });
}

/** What the exports say about a node or placeholder (R2): its name, and the file errors about it name. */
interface Named {
  readonly name: string;
  readonly file: string;
}

/** Each world file's exports, in sorted file order. */
type Modules = readonly (readonly [file: string, exports: readonly Export[]])[];

/** What building the world needs at every step: the reader, the world file, and the export names of nodes and placeholders. */
interface Context {
  readonly reader: Reader;
  /** The world file, nuhokai/index.ts, named from the cwd. */
  readonly worldFile: string;
  readonly nodeNames: ReadonlyMap<NodeV, Named>;
  readonly placeholderNames: ReadonlyMap<PlaceholderV, Named>;
}

/** A node as the walk placed it, under its parent (null at the top level). */
interface Placed {
  readonly node: NodeV;
  readonly parent: NodeV | null;
}

/**
 * R2: each value `is` picks, named by the export whose declaration makes it (`export const A = node(…)`), else the
 * defining file's first export of it (an alias there), else the first export in sorted file order.
 */
function namesOf<T extends NodeV | PlaceholderV>(modules: Modules, is: (value: Val) => value is T): Map<T, Named> {
  const named = new Map<T, Named>();
  const passes: ((file: string, entry: Export, value: T) => boolean)[] = [
    (_file, entry) => entry.own,
    (file, _entry, value) => file === value.at.file,
    () => true,
  ];
  for (const pass of passes) {
    for (const [file, exports] of modules) {
      for (const entry of exports) {
        const { name, value } = entry;
        if (name === "default" || !is(value) || named.has(value) || !pass(file, entry, value)) continue;
        named.set(value, { name, file: value.at.file });
      }
    }
  }
  return named;
}

/** The file errors about a node name (R2); the world file for the world itself. */
function fileOf(context: Context, node: NodeV | null): string {
  return node ? (context.nodeNames.get(node)?.file ?? node.at.file) : context.worldFile;
}

/** A node's name: its export name (R2), else its id. */
function nodeName(context: Context, node: NodeV): string {
  return context.nodeNames.get(node)?.name ?? node.id;
}

/**
 * R6: index.ts's default export, which must be a world with a string id and a list of children; an error about the id
 * or children is at that property, in the file defineWorld is written in.
 */
function worldIn(
  reader: Reader,
  modules: Modules,
  worldFile: string,
): { at: At; def: Rec; id: string; children: readonly Val[] } {
  const world = modules.find(([file]) => file === worldFile)?.[1].find(({ name }) => name === "default")?.value;
  if (!(world instanceof WorldV)) {
    throw new LoadError(
      worldFile,
      undefined,
      'the default export is not a world; export default defineWorld({ id: "...", name: "...", source: [...], children: [...] })',
    );
  }
  if (typeof world.def.id !== "string") {
    const at = reader.propertyAt(world.def, "id") ?? world.at;
    throw new LoadError(
      at.file,
      at,
      "the world's id is not a string; keep the id init gave it, or give it a fresh UUID",
    );
  }
  if (!Array.isArray(world.def.children)) {
    const at = reader.propertyAt(world.def, "children") ?? world.at;
    throw new LoadError(at.file, at, "the world's children is not a list of nodes: children: [A, B]");
  }
  return { at: world.at, def: world.def, id: world.def.id, children: world.def.children };
}

/** A node's load error, at its node() call. */
function failAt(context: Context, node: NodeV, rule: string): LoadError {
  return new LoadError(node.at.file, node.at, `${nodeName(context, node)}${rule}`);
}

/** R3, R7: depth-first from the world's children, a parent before its children, list order; every listing kept. */
async function walk(
  context: Context,
  world: { at: At; def: Rec; children: readonly Val[] },
): Promise<{ placed: Placed[]; listings: Listing[] }> {
  const { reader } = context;
  const placed: Placed[] = [];
  const listings: Listing[] = [];
  const seen = new Set<NodeV>();
  const place = async (children: readonly Val[], parent: NodeV | null): Promise<void> => {
    for (const [position, child] of children.entries()) {
      // The item in the list owner's file (or the spread that brought it in); else the owner's call.
      const listedAt = parent ? parent.at : world.at;
      const at = reader.itemIn(children, position, listedAt.file);
      if (!(child instanceof NodeV)) {
        const owner = parent ? `${nodeName(context, parent)}'s children` : "the world's children";
        const what = `${owner} list a value that is not a node: item ${position + 1} is ${valueInWords(child)}; list nodes made by node(...).edges(...), e.g. children: [A, B]`;
        const where = at ?? listedAt;
        // tsc reports a bad item at the `children:` property when the item came in through a spread.
        const property = reader.propertyAt(parent ? parent.def : world.def, "children");
        throw new LoadError(where.file, where, what, property?.file === where.file ? [property] : []);
      }
      listings.push({
        node: child.id,
        parent: parent ? parent.id : null,
        file: listedAt.file,
        ...(at ? { line: at.line } : {}),
      });
      if (seen.has(child)) continue;
      seen.add(child);
      placed.push({ node: child, parent });
      await place(context.reader.childrenOf(child), child);
    }
  };
  await place(world.children, null);
  return { placed, listings };
}

/** A lazy part of a node, read; a failure is a load error about the node's file, as the loader words it. */
async function lazily<T>(context: Context, node: NodeV, field: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof LoadError && error.line !== undefined) throw error;
    throw failAt(context, node, `.${field}: ${error instanceof LoadError ? error.rule : errorLine(error)}`);
  }
}

/** A node's uses or implements list, read from either step: an edge may sit in node() or in .edges(). */
async function edgeList(context: Context, node: NodeV, edge: "uses" | "implements"): Promise<readonly Val[]> {
  const fn = { ...node.def, ...node.edges }[edge];
  if (fn === undefined) return [];
  const read = () => (fn instanceof Fn ? context.reader.edgeValue(fn) : Promise.resolve(fn));
  const list = await lazily(context, node, edge, read);
  if (!Array.isArray(list)) {
    const example = edge === "uses" ? "uses: () => [A.run]" : "implements: () => [Contract]";
    throw failAt(context, node, `.${edge} does not return a list; return one, e.g. ${example}`);
  }
  return list;
}

/** A node's edges of one kind as read, each with its target. */
interface ReadEdges<E extends Edge> {
  readonly edges: E[];
  readonly targets: NodeV[];
}

/** A node's uses edges as read, with the list they were read from and each edge's first item in it (R15). */
interface ReadUses extends ReadEdges<UsesEdge> {
  readonly list: readonly Val[];
  readonly items: number[];
}

/** A node's uses edges, one per target with its ports in first-use order; a tbd it uses joins its placeholder (R4). */
async function usesOf(context: Context, node: NodeV, placeholders: Map<PlaceholderV, Placeholder>): Promise<ReadUses> {
  const ports = new Map<NodeV, { port: string[]; item: number }>();
  const list = await edgeList(context, node, "uses");
  for (const [item, ref] of list.entries()) {
    if (ref instanceof PlaceholderV) {
      let placeholder = placeholders.get(ref);
      if (!placeholder) {
        const name = context.placeholderNames.get(ref)?.name;
        // An unchecked world may give no description; the map and check still get a string.
        const description = typeof ref.description === "string" ? ref.description : "";
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
      throw failAt(
        context,
        node,
        ".uses lists a value that is not a port reference; list other nodes' ports, e.g. uses: () => [A.run]",
      );
    }
    const used = ports.get(target) ?? { port: [], item };
    if (!used.port.includes(port.name)) used.port.push(port.name);
    ports.set(target, used);
  }
  return {
    edges: [...ports].map(([target, { port }]) => ({ kind: "uses", to: target.id, port })),
    targets: [...ports.keys()],
    list,
    items: [...ports.values()].map(({ item }) => item),
  };
}

/** A node's implements edges, one per contract listed. */
async function implementsOf(context: Context, node: NodeV): Promise<ReadEdges<Edge>> {
  const list = await edgeList(context, node, "implements");
  const targets = list.map((contract) => {
    if (!(contract instanceof NodeV)) {
      throw failAt(
        context,
        node,
        ".implements lists a value that is not a node; list abstract nodes, e.g. implements: () => [Contract]",
      );
    }
    return contract;
  });
  return { edges: targets.map((contract) => ({ kind: "implements", to: contract.id })), targets };
}

/** A node's NodeSpec with its edges as read: their targets and where each was written. */
interface ReadNode {
  readonly spec: NodeSpec;
  readonly uses: ReadUses;
  readonly implements: ReadEdges<Edge>;
}

/** A placed node's NodeSpec (R2): its fields as plain data, its ports resolved, then its uses and implements edges. */
async function specOf(
  context: Context,
  { node, parent }: Placed,
  placeholders: Map<PlaceholderV, Placeholder>,
): Promise<ReadNode> {
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
  const fields = plain(context.reader, rest, node.at, nodeName(context, node)) as Record<string, unknown>;
  const spec = {
    schema: "nuhokai/node@1",
    id,
    name: nodeName(context, node),
    parent: parent ? parent.id : null,
    external: external ?? false,
    abstract: abstract ?? false,
    ...(fields as Omit<NodeSpec, "schema" | "id" | "name" | "parent" | "external" | "abstract">),
  } as NodeSpec;
  if (node.def.ports !== undefined) {
    const ports = await lazily(context, node, "ports", () => context.reader.portsOf(node));
    spec.ports = Object.entries(ports).map(
      ([name, port]) =>
        ({
          name,
          ...(plain(context.reader, port, node.at, `${nodeName(context, node)}.ports.${name}`) as object),
        }) as Port,
    );
  }
  const uses = await usesOf(context, node, placeholders);
  const contracts = await implementsOf(context, node);
  const edges = [...uses.edges, ...contracts.edges];
  if (edges.length) spec.edges = edges;
  return { spec, uses, implements: contracts };
}

/** R15: where each of a node's spec items was written in `file`, by line, in the NodeSpec's order. */
function specPlaces(reader: Reader, { spec, uses }: ReadNode, def: Rec, file: string): SpecPlaces {
  const line = (at: At | undefined) => (at?.file === file ? at.line : undefined);
  const items = (key: string) => {
    const list = def[key];
    return Array.isArray(list) ? list.map((_item, index) => line(reader.itemIn(list, index, file))) : [];
  };
  const ports = def.ports;
  const purpose = line(reader.propertyAt(def, "purpose"));
  return {
    ...(purpose === undefined ? {} : { purpose }),
    ports: (spec.ports ?? []).map((port) =>
      ports !== null && typeof ports === "object" && !Array.isArray(ports)
        ? line(reader.propertyAt(ports as Rec, port.name))
        : undefined,
    ),
    requirements: items("requirements"),
    testCases: items("testCases"),
    decisions: items("decisions"),
    uses: uses.items.map((item) => line(reader.itemIn(uses.list, item, file))),
  };
}

/** R8: exported but never reached, in sorted file order, each once. */
function orphansOf(context: Context, modules: Modules, reached: ReadonlySet<NodeV>): Orphan[] {
  const orphans: Orphan[] = [];
  const orphaned = new Set<NodeV>();
  for (const [, exports] of modules) {
    for (const { value } of exports) {
      if (!(value instanceof NodeV) || reached.has(value) || orphaned.has(value)) continue;
      orphaned.add(value);
      const file = fileOf(context, value);
      orphans.push({
        id: value.id,
        name: nodeName(context, value),
        file,
        ...(value.at.file === file ? { line: value.at.line } : {}),
      });
    }
  }
  return orphans;
}

/** The LoadedWorld from the read files (LoadWorld R2–R10). */
async function worldOf(
  reader: Reader,
  sources: readonly [string, SourceFile][],
  worldFile: string,
): Promise<LoadedWorld> {
  const modules: [string, Export[]][] = [];
  for (const [name, file] of sources) modules.push([name, await reader.exportsOf(file)]);
  const context: Context = {
    reader,
    worldFile,
    nodeNames: namesOf(modules, (value): value is NodeV => value instanceof NodeV),
    placeholderNames: namesOf(modules, (value): value is PlaceholderV => value instanceof PlaceholderV),
  };
  const world = worldIn(reader, modules, worldFile);
  const { placed, listings } = await walk(context, world);

  // R10: parents by position, so duplicate ids cannot misplace a node; children and paths from them.
  const position = new Map(placed.map(({ node }, at) => [node, at]));
  const parents = placed.map(({ parent }) => (parent === null ? null : (position.get(parent) ?? null)));
  const paths = nameNodes(
    placed.map(({ node }, at) => ({ name: nodeName(context, node), parent: parents[at] ?? null })),
  );
  const top: number[] = [];
  const children = placed.map((): number[] => []);
  parents.forEach((parent, at) => {
    (parent === null ? top : (children[parent] ?? [])).push(at);
  });

  const placeholders = new Map<PlaceholderV, Placeholder>();
  const nodes: LoadedNode[] = [];
  // R14: edge targets by reference, as parents are, so a duplicate id never points elsewhere.
  const positionOf = (target: NodeV) => position.get(target) ?? null;
  const problems: Finding[] = [];
  for (const [at, entry] of placed.entries()) {
    // R9: the defining file, and the node() call's place and where its source was written, when that file holds it.
    const file = fileOf(context, entry.node);
    const read = await specOf(context, entry, placeholders);
    const path = paths[at] ?? "";
    const holds = entry.node.at.file === file;
    const shaped = shapeNode(reader, read, entry.node, { file, holds, path });
    problems.push(...shaped.problems);
    nodes.push({
      index: at,
      spec: read.spec,
      parent: parents[at] ?? null,
      children: children[at] ?? [],
      uses: read.uses.targets.map(positionOf),
      contracts: read.implements.targets.map(positionOf),
      path,
      file,
      ...(holds ? { line: entry.node.at.line } : {}),
      ...(shaped.source ? { source: shaped.source } : {}),
      ...(shaped.places ? { places: shaped.places } : {}),
      ...(shaped.reshaped.length > 0 ? { reshaped: shaped.reshaped } : {}),
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

  // R16: the world's source is a list of strings, or none; what it drops is a problem at the world.
  const worldShape = new SpecShape({ file: world.at.file, line: world.at.line, label: "the world" });
  const rawSource = world.def.source;
  const source = worldShape.source(
    Array.isArray(rawSource) ? plain(reader, rawSource, world.at, "the world's source") : rawSource,
    reader.sourcePlaces(world.def, "source", world.at.file),
  );

  return {
    id: world.id,
    ...(typeof world.def.name === "string" ? { name: world.def.name } : {}),
    ...(source ? { source: source.source } : {}),
    file: worldFile,
    definedIn: world.at.file,
    line: world.at.line,
    ...(source?.places ? { sourcePlaces: source.places } : {}),
    nodes,
    top,
    placeholders: [...placeholders.values()],
    listings,
    orphans: orphansOf(context, modules, reached),
    problems: [...worldShape.problems, ...problems],
  };
}

/** A node's spec with its fields' shapes judged (R16), and where they were written, when `file` holds its call. */
interface ShapedNode {
  readonly source?: SourcePlaces;
  readonly places?: SpecPlaces;
  readonly reshaped: ShapedField[];
  readonly problems: readonly Finding[];
}

/**
 * R16: replace each field of `read.spec` whose shape is wrong, in place, by what it can keep: a source by its string
 * entries ([] for no list), the purpose by "" when it is no string, requirements, test cases and decisions by their
 * object items (dropped when no list). Places follow the items kept, and are known only when the node's defining
 * `file` holds its call; every problem names the node by `path`, in `file`.
 */
function shapeNode(
  reader: Reader,
  read: ReadNode,
  node: NodeV,
  { file, holds, path }: { file: string; holds: boolean; path: string },
): ShapedNode {
  const spec = read.spec as unknown as Record<string, unknown>;
  const def = node.def;
  const lineOf = (at: At | undefined) => (holds && at?.file === file ? at.line : undefined);
  const raw = holds ? specPlaces(reader, read, def, file) : undefined;
  const shape = new SpecShape({ file, ...(holds ? { line: node.at.line } : {}), node: path, label: read.spec.name });
  const reshaped: ShapedField[] = [];

  const given = holds ? reader.sourcePlaces(def, "source", file) : undefined;
  const source = shape.source(spec.source, given);
  const list = Array.isArray(spec.source) ? spec.source : undefined;
  if (!source || source.source.length !== list?.length) reshaped.push("source");
  spec.source = source?.source ?? [];

  const purpose = shape.text(
    "purpose",
    spec.purpose,
    raw?.purpose ?? lineOf(reader.propertyAt(def, "purpose")),
    "say why the node exists, as a string",
  );
  if (purpose !== spec.purpose) reshaped.push("purpose");
  spec.purpose = purpose;

  const places: Record<"requirements" | "testCases" | "decisions", readonly (number | undefined)[]> = {
    requirements: raw?.requirements ?? [],
    testCases: raw?.testCases ?? [],
    decisions: raw?.decisions ?? [],
  };
  for (const field of ["requirements", "testCases", "decisions"] as const) {
    const value = spec[field];
    const kept = shape.objects(field, value, lineOf(reader.propertyAt(def, field)), (index) => raw?.[field][index]);
    if (kept === undefined) {
      if (value !== undefined) reshaped.push(field);
      delete spec[field];
      places[field] = [];
      continue;
    }
    if (kept.items.length !== (value as unknown[]).length) reshaped.push(field);
    spec[field] = kept.items;
    places[field] = kept.lines;
  }
  return {
    ...(source?.places ? { source: source.places } : {}),
    ...(raw ? { places: { ...raw, ...places } } : {}),
    reshaped,
    problems: shape.problems,
  };
}
