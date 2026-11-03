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
import {
  type ArrowFunction,
  type CallExpression,
  type Expression,
  type FunctionExpression,
  type Identifier,
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBlock,
  isCallExpression,
  isComputedPropertyName,
  isElementAccessExpression,
  isEmptyStatement,
  isExportAssignment,
  isExportDeclaration,
  isFunctionExpression,
  isIdentifier,
  isImportDeclaration,
  isImportSpecifier,
  isInterfaceDeclaration,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPrefixUnaryExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isReturnStatement,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isSpreadElement,
  isStringLiteral,
  isTemplateExpression,
  isTypeAliasDeclaration,
  isVariableDeclaration,
  isVariableStatement,
  type Node,
  type SourceFile,
  SyntaxKind,
} from "typescript/unstable/ast";
import { type Project, SymbolFlags, type Symbol as TsSymbol } from "typescript/unstable/async";
import { compareText } from "../check/diagnostics.ts";
import { checkerPath, withChecker } from "../check/type-check.ts";
import { CliError, errorLine, oneLine } from "../shared/failure.ts";
import { requireWorld } from "../shared/inspect.ts";
import { nameInWorld, WORLD_GENERATED_DIR, WORLD_INDEX } from "../shared/paths.ts";

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

/** A name that resolves to no declaration in the world: as a callee, it is a call the format does not allow. */
class UnknownName extends CliError {}

/** The functions a world file may call, imported from @nuhokai/world under their own name. */
const WORLD_FUNCTIONS = new Set(["node", "defineWorld", "inherited", "tbd"]);
const ALLOWED_CALLS = "node, .edges, defineWorld, tbd.call, tbd.event and inherited";

// ─── Values ──────────────────────────────────────────────────────────────

/** A value read from a world file: data, or one of the format's objects. */
type Val = undefined | null | boolean | number | string | readonly Val[] | Rec | Ref;
interface Rec {
  readonly [key: string]: Val;
}
type Ref = WorldFn | Draft | EdgesFn | Fn | NodeV | PortsNs | PortV | InheritedV | HoleV | WorldV;

/** Where a value was made: a file named from the cwd, and a 1-based line. */
interface At {
  readonly file: string;
  readonly line: number;
}

/** node, defineWorld, inherited, tbd, tbd.call or tbd.event. */
class WorldFn {
  constructor(readonly name: string) {}
}
/** node(def): step one. */
class Draft {
  constructor(
    readonly at: At,
    readonly def: Rec,
  ) {}
}
/** draft.edges, waiting for its argument. */
class EdgesFn {
  constructor(readonly draft: Draft) {}
}
/** An arrow or function expression with the parameters it closes over. */
class Fn {
  constructor(
    readonly node: ArrowFunction | FunctionExpression,
    readonly env: Env,
  ) {}
}
/** node(def).edges(edges): a node, by identity. */
class NodeV {
  ports?: Promise<Readonly<Record<string, Rec>>>;
  constructor(
    readonly at: At,
    readonly def: Rec,
    readonly edges: Rec,
  ) {}
  get id(): string {
    return typeof this.def.id === "string" ? this.def.id : String(this.def.id);
  }
}
/** A node's `ports` namespace. */
class PortsNs {
  constructor(readonly node: NodeV) {}
}
/** A reference to a node's own port, by name. */
class PortV {
  constructor(
    readonly node: NodeV,
    readonly name: string,
  ) {}
}
/** inherited(node, contract port). */
class InheritedV {
  constructor(
    readonly node: Val,
    readonly port: Val,
  ) {}
}
/** tbd.call or tbd.event: a placeholder, by identity. */
class HoleV {
  constructor(
    readonly at: At,
    readonly kind: "call" | "event",
    readonly description: Val,
  ) {}
}
/** defineWorld(def). */
class WorldV {
  constructor(readonly def: Rec) {}
}

/** Parameters in scope, by their declaration. */
type Env = ReadonlyMap<Node, Val>;
const NO_ENV: Env = new Map();

function isRec(value: Val): value is Rec {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** A record with `key` defined as data, so `__proto__` stays a plain key. */
function withKey(record: Record<string, Val>, key: string, value: Val): void {
  Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
}

// ─── Reading ─────────────────────────────────────────────────────────────

class Reader {
  /** Each const's value, by its declaration: read once, so a node read twice is one node. */
  private readonly declared = new Map<Node, Promise<Val>>();
  /** Each node() and tbd call's value, by the call: one object per call. */
  private readonly made = new Map<Node, Val>();
  private readonly reading = new Set<Node>();
  /** Every identifier's symbol, asked for in one batch per file; each alias's target, asked once. */
  private readonly symbols = new Map<Node, TsSymbol | undefined>();
  private readonly targets = new Map<number, Promise<TsSymbol>>();
  private readonly declarations = new Map<string, Promise<Node | undefined>>();

  constructor(
    private readonly project: Project,
    /** Each world file's absolute (and real) path to its name from the cwd. */
    private readonly names: ReadonlyMap<string, string>,
  ) {}

  /**
   * Ask the checker up front, in parallel, for what reading will need: the symbol of every name in a value position,
   * each alias's target, each target's declaration, and each file's module symbol. Reading then hits these caches.
   */
  async prepare(files: readonly SourceFile[]): Promise<void> {
    const checker = this.project.checker;
    const batches = files.map((file) => {
      const identifiers: Node[] = [];
      const visit = (node: Node): void => {
        if (isIdentifier(node) && isValuePosition(node)) identifiers.push(node);
        node.forEachChild(visit);
      };
      file.forEachChild(visit);
      return identifiers;
    });
    const [modules, ...symbols] = await Promise.all([
      checker.getSymbolAtLocation(files),
      ...batches.map((identifiers) => checker.getSymbolAtLocation(identifiers)),
    ]);
    files.forEach((file, at) => {
      this.symbols.set(file, modules[at]);
    });
    batches.forEach((identifiers, batch) => {
      identifiers.forEach((identifier, at) => {
        this.symbols.set(identifier, symbols[batch]?.[at]);
      });
    });
    const known = [...new Set(this.symbols.values())].flatMap((symbol) => (symbol ? [symbol] : []));
    const targets = await Promise.all(known.map((symbol) => this.target(symbol)));
    await Promise.all([...known, ...targets].map((symbol) => this.declarationOf(symbol)));
  }

  /** A symbol's value declaration (else its first: an import's specifier), resolved to its node once. */
  private declarationOf(symbol: TsSymbol): Promise<Node | undefined> {
    const handle = symbol.valueDeclaration ?? symbol.declarations[0];
    if (!handle) return Promise.resolve(undefined);
    const key = `${handle.path}:${handle.index}`;
    const known = this.declarations.get(key);
    if (known) return known;
    const declaration = handle.resolve();
    this.declarations.set(key, declaration);
    return declaration;
  }

  /** A file's name from the cwd, or undefined outside the world. */
  nameOf(file: SourceFile): string | undefined {
    return this.names.get(file.fileName) ?? this.names.get(resolve(file.fileName));
  }

  at(node: Node): At {
    const file = node.getSourceFile();
    return {
      file: this.nameOf(file) ?? file.fileName,
      line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
    };
  }

  fail(node: Node, message: string): CliError {
    const { file, line } = this.at(node);
    return new CliError(`${file}:${line}: ${message}`);
  }

  /** What an expression is, read without running it. */
  async read(expr: Expression, env: Env): Promise<Val> {
    if (isStringLiteral(expr) || isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    if (isNumericLiteral(expr)) return Number(expr.text);
    if (expr.kind === SyntaxKind.TrueKeyword) return true;
    if (expr.kind === SyntaxKind.FalseKeyword) return false;
    if (expr.kind === SyntaxKind.NullKeyword) return null;
    if (isParenthesizedExpression(expr) || isAsExpression(expr) || isSatisfiesExpression(expr)) {
      return this.read(expr.expression, env);
    }
    if (isNonNullExpression(expr)) return this.read(expr.expression, env);
    if (isPrefixUnaryExpression(expr) && expr.operator === SyntaxKind.MinusToken) {
      const operand = await this.read(expr.operand, env);
      if (typeof operand === "number") return -operand;
    }
    if (isTemplateExpression(expr)) {
      let text = expr.head.text;
      for (const span of expr.templateSpans) {
        const value = await this.read(span.expression, env);
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          throw this.fail(span.expression, "a template holds only strings, numbers and booleans here");
        }
        text += String(value) + span.literal.text;
      }
      return text;
    }
    if (isBinaryExpression(expr) && expr.operatorToken.kind === SyntaxKind.PlusToken) {
      const left = await this.read(expr.left, env);
      const right = await this.read(expr.right, env);
      if (typeof left === "string" || typeof right === "string") {
        if (isPrimitive(left) && isPrimitive(right)) return String(left) + String(right);
      } else if (typeof left === "number" && typeof right === "number") {
        return left + right;
      }
      throw this.fail(expr, "+ joins only strings and numbers here");
    }
    if (isObjectLiteralExpression(expr)) return this.object(expr.properties, env);
    if (isArrayLiteralExpression(expr)) {
      const items: Val[] = [];
      for (const element of expr.elements) {
        if (isSpreadElement(element)) {
          const spread = await this.read(element.expression, env);
          if (!Array.isArray(spread)) throw this.fail(element, "only an array spreads into an array");
          items.push(...spread);
        } else {
          items.push(await this.read(element, env));
        }
      }
      return items;
    }
    if (isIdentifier(expr)) return this.identifier(expr, env);
    if (isPropertyAccessExpression(expr)) {
      return this.member(await this.read(expr.expression, env), expr.name.text, expr);
    }
    if (isElementAccessExpression(expr)) {
      const key = await this.read(expr.argumentExpression, env);
      if (typeof key !== "string") throw this.fail(expr, "an index here is a string literal");
      return this.member(await this.read(expr.expression, env), key, expr);
    }
    if (isCallExpression(expr)) return this.call(expr, env);
    if (isArrowFunction(expr) || isFunctionExpression(expr)) return new Fn(expr, env);
    throw this.fail(expr, `cannot read ${SyntaxKind[expr.kind]} without running it`);
  }

  private async object(properties: Iterable<Node>, env: Env): Promise<Rec> {
    const record: Record<string, Val> = {};
    for (const property of properties) {
      if (isPropertyAssignment(property)) {
        const name = property.name;
        let key: Val;
        if (isComputedPropertyName(name)) key = await this.read(name.expression, env);
        else key = (name as { text?: string }).text;
        if (typeof key !== "string" && typeof key !== "number") {
          throw this.fail(property, "a key here is a name or a string");
        }
        withKey(record, String(key), await this.read(property.initializer, env));
      } else if (isShorthandPropertyAssignment(property)) {
        // `{ id }`: the name's own symbol is the property; its value is the variable's.
        const name = property.name as Identifier;
        const symbol = await this.project.checker.getShorthandAssignmentValueSymbol(property);
        withKey(record, name.text, await this.identifier(name, env, symbol));
      } else if (isSpreadAssignment(property)) {
        const spread = await this.read(property.expression, env);
        if (!isRec(spread)) throw this.fail(property, "only a plain object spreads into an object");
        for (const [key, value] of Object.entries(spread)) withKey(record, key, value);
      } else {
        throw this.fail(property, `cannot read ${SyntaxKind[property.kind]} in an object without running it`);
      }
    }
    return record;
  }

  /** What a name refers to: a parameter in scope, a const (read once), or a function of @nuhokai/world. */
  private async identifier(id: Identifier, env: Env, known?: TsSymbol): Promise<Val> {
    if (id.text === "undefined") return undefined;
    const checker = this.project.checker;
    const symbol = known ?? (this.symbols.has(id) ? this.symbols.get(id) : await checker.getSymbolAtLocation(id));
    if (!symbol) throw new UnknownName(this.fail(id, `'${id.text}' refers to nothing the checker knows`).message);
    const local = await this.declarationOf(symbol);
    const imported = worldImport(local);
    if (imported) return new WorldFn(imported);
    const from = importedFrom(local);
    if (from === "@nuhokai/world") {
      throw this.fail(
        id,
        `'${id.text}': import node, defineWorld, inherited and tbd from @nuhokai/world under their own name`,
      );
    }
    if (from !== undefined && !from.startsWith(".")) {
      throw this.fail(id, `'${id.text}' comes from '${from}'; a world file reads only world files and @nuhokai/world`);
    }
    const target = await this.target(symbol);
    const declaration = await this.declarationOf(target);
    if (!declaration) {
      throw new UnknownName(this.fail(id, `'${id.text}' refers to nothing: is its import's file there?`).message);
    }
    const file = declaration.getSourceFile();
    if (this.nameOf(file) === undefined) {
      throw this.fail(
        id,
        `'${id.text}' is declared outside the world (${file.fileName}); a world file reads only world files and @nuhokai/world`,
      );
    }
    if (declaration.kind === SyntaxKind.Parameter) {
      if (!env.has(declaration)) throw this.fail(id, `'${id.text}' is a parameter out of scope`);
      return env.get(declaration);
    }
    return this.declaration(declaration, id);
  }

  private target(symbol: TsSymbol): Promise<TsSymbol> {
    if (!(symbol.flags & SymbolFlags.Alias)) return Promise.resolve(symbol);
    const known = this.targets.get(symbol.id);
    if (known) return known;
    const target = this.project.checker.getAliasedSymbol(symbol);
    this.targets.set(symbol.id, target);
    return target;
  }

  /** A const's or default export's value, read once. */
  async declaration(declaration: Node, from: Node): Promise<Val> {
    const known = this.declared.get(declaration);
    if (known) return known;
    if (this.reading.has(declaration)) throw this.fail(from, "a value refers to itself while being read");
    let value: Promise<Val>;
    if (isVariableDeclaration(declaration)) {
      const initializer = declaration.initializer;
      if (!initializer) throw this.fail(declaration, "a const read here needs a value");
      value = this.read(initializer, NO_ENV);
    } else if (isExportAssignment(declaration)) {
      value = this.read(declaration.expression, NO_ENV);
    } else {
      throw this.fail(from, `cannot read a ${SyntaxKind[declaration.kind]} without running it`);
    }
    this.reading.add(declaration);
    try {
      this.declared.set(declaration, value);
      return await value;
    } finally {
      this.reading.delete(declaration);
    }
  }

  private member(object: Val, name: string, where: Node): Val {
    if (object instanceof WorldFn && object.name === "tbd" && (name === "call" || name === "event")) {
      return new WorldFn(`tbd.${name}`);
    }
    if (object instanceof Draft && name === "edges") return new EdgesFn(object);
    if (object instanceof NodeV) return name === "ports" ? new PortsNs(object) : new PortV(object, name);
    if (object instanceof PortsNs) return new PortV(object.node, name);
    if (isRec(object)) return Object.hasOwn(object, name) ? object[name] : undefined;
    throw this.fail(where, `cannot read .${name} here without running it`);
  }

  private async call(expr: CallExpression, env: Env): Promise<Val> {
    const notAllowed = () => {
      const file = expr.getSourceFile();
      const text = file.text.slice(expr.expression.getStart(file), expr.expression.end).replace(/\s+/g, " ");
      const callee = text.length > 40 ? `${text.slice(0, 37)}...` : text;
      return this.fail(expr, `world files are declarative: they call only ${ALLOWED_CALLS}, not ${callee}(...)`);
    };
    // A callee that is a name (or a path on one) the loader cannot read is no function of the format: say so about
    // the call. A callee made by a call, node(…).edges, fails on its own.
    let root: Node = expr.expression;
    while (isPropertyAccessExpression(root)) root = root.expression;
    let callee: Val;
    try {
      callee = await this.read(expr.expression, env);
    } catch (error) {
      if (error instanceof UnknownName && isIdentifier(root)) throw notAllowed();
      throw error;
    }
    const args: Val[] = [];
    for (const arg of expr.arguments) {
      if (isSpreadElement(arg)) throw this.fail(arg, "a call here takes no spread");
      args.push(await this.read(arg, env));
    }
    if (callee instanceof Fn) return this.apply(callee, args);
    if (callee instanceof EdgesFn) {
      return this.once(expr, () => {
        const edges = args[0];
        if (!isRec(edges))
          throw this.fail(expr, ".edges() takes an object: .edges({}) or .edges({ uses: () => [...] })");
        return new NodeV(callee.draft.at, callee.draft.def, edges);
      });
    }
    if (!(callee instanceof WorldFn)) throw notAllowed();
    const arg = args[0];
    switch (callee.name) {
      case "node":
        if (!isRec(arg)) throw this.fail(expr, "node() takes an object");
        return new Draft(this.at(expr), arg);
      case "defineWorld":
        if (!isRec(arg)) throw this.fail(expr, "defineWorld() takes an object");
        return new WorldV(arg);
      case "inherited":
        return new InheritedV(args[0], args[1]);
      case "tbd.call":
      case "tbd.event":
        return this.once(
          expr,
          () =>
            new HoleV(
              this.at(expr),
              callee.name === "tbd.call" ? "call" : "event",
              isRec(arg) ? arg.description : undefined,
            ),
        );
      default:
        throw this.fail(expr, `${callee.name} is not a function`);
    }
  }

  private once(call: Node, make: () => Val): Val {
    if (!this.made.has(call)) this.made.set(call, make());
    return this.made.get(call);
  }

  /** A function's value for these arguments: its expression body, or the one `return` of its block. */
  async apply(fn: Fn, args: readonly Val[]): Promise<Val> {
    const env = new Map(fn.env);
    fn.node.parameters.forEach((parameter, index) => {
      if (!isIdentifier(parameter.name)) throw this.fail(parameter, "a parameter here is a plain name");
      env.set(parameter, args[index]);
    });
    const body = fn.node.body;
    if (body && isBlock(body)) {
      const [statement, ...rest] = body.statements;
      if (!statement || rest.length || !isReturnStatement(statement) || !statement.expression) {
        throw this.fail(body, "a function here is an expression or one return");
      }
      return this.read(statement.expression, env);
    }
    return this.read(body as Expression, env);
  }

  /** A node's direct children, in list order; none for a leaf. */
  childrenOf(node: NodeV): readonly Val[] {
    const children = node.def.children;
    if (children === undefined) return [];
    if (!Array.isArray(children)) {
      throw new CliError(`${node.at.file}:${node.at.line}: children is a list of nodes: children: [A, B]`);
    }
    return children;
  }

  /** A node's port definitions: a leaf's as authored; a dome's copied from its children's, each with its delegate. */
  portsOf(node: NodeV): Promise<Readonly<Record<string, Rec>>> {
    node.ports ??= (async () => {
      const ports = node.def.ports;
      const where = `${node.at.file}:${node.at.line}`;
      if (node.def.children === undefined) {
        if (ports === undefined) return {};
        if (!isRec(ports)) throw new CliError(`${where}: a leaf's ports are a record of port definitions`);
        return ports as Record<string, Rec>;
      }
      if (ports === undefined) return {};
      if (!isRec(ports)) {
        throw new CliError(`${where}: a dome's ports are a record of its children's ports: ports: { run: A.run }`);
      }
      const children = this.childrenOf(node);
      const resolved: Record<string, Rec> = {};
      for (const [name, ref] of Object.entries(ports)) {
        const child = ref instanceof PortV || ref instanceof InheritedV ? ref.node : undefined;
        if (!(child instanceof NodeV) || !children.includes(child)) {
          throw new CliError(
            `${where}: \`${name}\` exposes a port of a node that is not one of this dome's direct children`,
          );
        }
        const port = ref instanceof InheritedV ? (ref.port instanceof PortV ? ref.port : undefined) : (ref as PortV);
        if (!port) throw new CliError(`${where}: \`${name}\` inherits no port`);
        const source = (await this.portsOf(port.node))[port.name];
        if (!source) throw new CliError(`${where}: \`${port.name}\` is not a port of its node`);
        withKey(resolved, name, { ...source, delegate: { to: child.id, port: port.name } });
      }
      return resolved;
    })();
    return node.ports;
  }

  /**
   * The whole file is data: every top-level statement is an import, an export or a declaration, and every top-level
   * value is read, used or not, so code anywhere is a load error at its line.
   */
  async readStatements(file: SourceFile): Promise<void> {
    for (const statement of file.statements) {
      if (
        isImportDeclaration(statement) ||
        isExportDeclaration(statement) ||
        isInterfaceDeclaration(statement) ||
        isTypeAliasDeclaration(statement) ||
        isEmptyStatement(statement)
      ) {
        continue;
      }
      if (isExportAssignment(statement)) {
        await this.declaration(statement, statement);
      } else if (isVariableStatement(statement)) {
        if (isAmbient(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!isIdentifier(declaration.name)) throw this.fail(declaration, "a declaration here names one value");
          await this.declaration(declaration, declaration);
        }
      } else if (!isAmbient(statement)) {
        throw this.fail(
          statement,
          `world files hold only imports, exports and declarations of data, not a ${SyntaxKind[statement.kind]}`,
        );
      }
    }
  }

  /** Every node read so far, in the order its .edges() call was first read. */
  nodes(): NodeV[] {
    return [...this.made.values()].filter((value): value is NodeV => value instanceof NodeV);
  }

  /** Each export of a world file, by name in code-unit order (as a module namespace lists them), with its value. */
  async exportsOf(file: SourceFile): Promise<[string, Val][]> {
    const checker = this.project.checker;
    const module = this.symbols.has(file) ? this.symbols.get(file) : await checker.getSymbolAtLocation(file);
    if (!module) return [];
    const exports: [string, Val][] = [];
    const symbols = [...(await checker.getExportsOfModule(module))].sort((a, b) => compareText(a.name, b.name));
    for (const symbol of symbols) {
      const target = await this.target(symbol);
      const declaration = target.valueDeclaration && (await this.declarationOf(target));
      if (!declaration || this.nameOf(declaration.getSourceFile()) === undefined) continue;
      if (!isVariableDeclaration(declaration) && !isExportAssignment(declaration)) continue;
      exports.push([symbol.name, await this.declaration(declaration, declaration)]);
    }
    return exports;
  }
}

/** The function of @nuhokai/world an import specifier names (`node`, `tbd`, …), if it imports one under its own name. */
function worldImport(declaration: Node | undefined): string | undefined {
  if (!declaration || !isImportSpecifier(declaration)) return undefined;
  const statement = declaration.parent?.parent?.parent;
  if (!statement || !isImportDeclaration(statement) || declaration.isTypeOnly) return undefined;
  const module = statement.moduleSpecifier;
  if (!isStringLiteral(module) || module.text !== "@nuhokai/world") return undefined;
  const name = declaration.propertyName ?? declaration.name;
  return isIdentifier(name) && WORLD_FUNCTIONS.has(name.text) && name.text === declaration.name.text
    ? name.text
    : undefined;
}

/** Whether a statement only declares a type or an ambient value: `declare …`. */
function isAmbient(statement: Node): boolean {
  const modifiers = (statement as { modifiers?: readonly Node[] }).modifiers ?? [];
  return modifiers.some((modifier) => modifier.kind === SyntaxKind.DeclareKeyword);
}

/** The module an import binding comes from, if `declaration` is one. */
function importedFrom(declaration: Node | undefined): string | undefined {
  let at = declaration;
  while (at && !isImportDeclaration(at)) {
    if (at.kind !== SyntaxKind.ImportSpecifier && at.kind !== SyntaxKind.NamedImports) {
      if (at.kind !== SyntaxKind.ImportClause && at.kind !== SyntaxKind.NamespaceImport) return undefined;
    }
    at = at.parent;
  }
  return at && isStringLiteral(at.moduleSpecifier) ? at.moduleSpecifier.text : undefined;
}

/** Whether an identifier stands for a value the reader may look up: not a property name, key or declared name. */
function isValuePosition(identifier: Node): boolean {
  const parent = identifier.parent;
  if (!parent) return false;
  switch (parent.kind) {
    case SyntaxKind.PropertyAccessExpression:
      return (parent as { expression?: Node }).expression === identifier;
    case SyntaxKind.PropertyAssignment:
    case SyntaxKind.VariableDeclaration:
      return (parent as { initializer?: Node }).initializer === identifier;
    case SyntaxKind.CallExpression:
    case SyntaxKind.ElementAccessExpression:
    case SyntaxKind.ArrayLiteralExpression:
    case SyntaxKind.SpreadElement:
    case SyntaxKind.SpreadAssignment:
    case SyntaxKind.ShorthandPropertyAssignment:
    case SyntaxKind.ReturnStatement:
    case SyntaxKind.ArrowFunction:
    case SyntaxKind.ExportAssignment:
    case SyntaxKind.BinaryExpression:
    case SyntaxKind.TemplateSpan:
    case SyntaxKind.ParenthesizedExpression:
    case SyntaxKind.AsExpression:
    case SyntaxKind.SatisfiesExpression:
    case SyntaxKind.NonNullExpression:
      return true;
    default:
      return false;
  }
}

function isPrimitive(value: Val): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/** Plain data, as NodeSpec holds it; a format object where data belongs is a CliError at `where`. */
function plain(value: Val, where: string): unknown {
  if (Array.isArray(value)) return value.map((item) => plain(item, where));
  if (isRec(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(out, key, {
        value: plain(item, where),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  if (typeof value === "object" && value !== null)
    throw new CliError(`${where}: holds a node or port where data belongs`);
  return value;
}

// ─── The world ───────────────────────────────────────────────────────────

/** What the walk learnt about a node or hole from the exports: its name and the file errors about it name. */
interface Named {
  readonly name: string;
  readonly file: string;
}

/**
 * Load the world at `root`, the project directory as named from the cwd: read every world file with the pinned
 * checker and nuhokai/tsconfig.json, and answer the world as its id, name, source, NodeSpecs, parents, tbd
 * placeholders, listings, orphans and node files. Runs, writes and prompts nothing, and checks no rule. Every failure
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

/** The LoadedWorld from the read files (LoadWorld R2–R10). */
async function worldOf(reader: Reader, sources: readonly [string, SourceFile][], index: string): Promise<LoadedWorld> {
  const modules: [string, [string, Val][]][] = [];
  for (const [name, file] of sources) modules.push([name, await reader.exportsOf(file)]);

  /** R2: the defining file's export, else the first export in sorted file order. */
  const namesOf = <T extends NodeV | HoleV>(is: (value: Val) => value is T): Map<T, Named> => {
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
  };
  const names = namesOf((value): value is NodeV => value instanceof NodeV);
  const holeNames = namesOf((value): value is HoleV => value instanceof HoleV);
  const fileOf = (node: NodeV | null) => (node ? (names.get(node)?.file ?? node.at.file) : index);
  const nameOf = (node: NodeV) => names.get(node)?.name ?? node.id;

  const world = modules.find(([file]) => file === index)?.[1].find(([exported]) => exported === "default")?.[1];
  if (!(world instanceof WorldV) || typeof world.def.id !== "string" || !Array.isArray(world.def.children)) {
    throw new CliError(
      `${index}: the default export is not a world; export default defineWorld({ id: "...", name: "...", source: [...], children: [...] })`,
    );
  }

  // R3, R7: depth-first, a parent before its children, record order; every listing kept.
  const placed: { node: NodeV; parent: NodeV | null }[] = [];
  const listings: Listing[] = [];
  const seen = new Set<NodeV>();
  const place = async (children: readonly Val[], parent: NodeV | null): Promise<void> => {
    for (const child of children) {
      if (!(child instanceof NodeV)) {
        const owner = parent ? `${nameOf(parent)}'s children` : "the world's children";
        throw new CliError(`${fileOf(parent)}: ${owner} list a value that is not a node`);
      }
      listings.push({ node: child.id, parent: parent ? parent.id : null });
      if (seen.has(child)) continue;
      seen.add(child);
      placed.push({ node: child, parent });
      await place(reader.childrenOf(child), child);
    }
  };
  /** A lazy part of a node, read; a failure is a load error about the node's file, as the loader words it. */
  const lazily = async <T>(node: NodeV, field: string, read: () => Promise<T>): Promise<T> => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof CliError && /^\S+:\d+: /.test(error.message)) throw error;
      throw new CliError(`${fileOf(node)}: ${nameOf(node)}.${field}: ${errorLine(error)}`);
    }
  };
  await place(world.def.children, null);

  const placeholders = new Map<HoleV, Placeholder>();
  const edgeList = async (node: NodeV, edge: "uses" | "implements"): Promise<readonly Val[]> => {
    // Both steps merged: an edge may sit in either.
    const fn = { ...node.def, ...node.edges }[edge];
    if (fn === undefined) return [];
    const list = await lazily(node, edge, () => (fn instanceof Fn ? reader.apply(fn, []) : Promise.resolve(fn)));
    if (!Array.isArray(list)) throw new CliError(`${fileOf(node)}: ${nameOf(node)}.${edge} does not return a list`);
    return list;
  };

  const usesOf = async (node: NodeV): Promise<UsesEdge[]> => {
    const ports = new Map<NodeV, string[]>();
    for (const ref of await edgeList(node, "uses")) {
      if (ref instanceof HoleV) {
        let placeholder = placeholders.get(ref);
        if (!placeholder) {
          const name = holeNames.get(ref)?.name;
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
          ? Object.hasOwn(await lazily(target, "ports", () => reader.portsOf(target)), ref.name)
          : port instanceof PortV;
      if (!(target instanceof NodeV) || !(port instanceof PortV) || !owns) {
        throw new CliError(`${fileOf(node)}: ${nameOf(node)}.uses lists a value that is not a port reference`);
      }
      const used = ports.get(target) ?? [];
      if (!used.includes(port.name)) used.push(port.name);
      ports.set(target, used);
    }
    return [...ports].map(([target, port]) => ({ kind: "uses", to: target.id, port }));
  };

  const implementsOf = async (node: NodeV): Promise<Edge[]> =>
    (await edgeList(node, "implements")).map((contract) => {
      if (!(contract instanceof NodeV)) {
        throw new CliError(`${fileOf(node)}: ${nameOf(node)}.implements lists a value that is not a node`);
      }
      return { kind: "implements", to: contract.id };
    });

  const nodes: NodeSpec[] = [];
  for (const { node, parent } of placed) {
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
    const fields = plain(rest, fileOf(node)) as Record<string, unknown>;
    const spec = {
      schema: "nuhokai/node@1",
      id,
      name: nameOf(node),
      parent: parent ? parent.id : null,
      external: external ?? false,
      abstract: abstract ?? false,
      ...(fields as Omit<NodeSpec, "schema" | "id" | "name" | "parent" | "external" | "abstract">),
    } as NodeSpec;
    if (node.def.ports !== undefined) {
      const ports = await lazily(node, "ports", () => reader.portsOf(node));
      spec.ports = Object.entries(ports).map(
        ([name, port]) => ({ name, ...(plain(port, fileOf(node)) as object) }) as Port,
      );
    }
    const edges = [...(await usesOf(node)), ...(await implementsOf(node))];
    if (edges.length) spec.edges = edges;
    nodes.push(spec);
  }

  // Every node is read whole, also an orphan: its edges, and a dome's ports with their check, so a broken node is a
  // load error whether or not the world lists it.
  for (const node of reader.nodes()) {
    if (seen.has(node)) continue;
    await edgeList(node, "uses");
    await edgeList(node, "implements");
    if (node.def.ports !== undefined) await lazily(node, "ports", () => reader.portsOf(node));
  }

  // R8: exported but never reached, in sorted file order.
  const orphans: Orphan[] = [];
  const orphaned = new Set<NodeV>();
  for (const [, exports] of modules) {
    for (const [, value] of exports) {
      if (!(value instanceof NodeV) || seen.has(value) || orphaned.has(value)) continue;
      orphaned.add(value);
      orphans.push({ id: value.id, name: nameOf(value), file: fileOf(value) });
    }
  }

  // R9: each node's defining file and the line of its node() call, read from the call itself.
  const files = placed.map(
    ({ node }): NodeFile =>
      node.at.file === fileOf(node)
        ? { node: node.id, file: node.at.file, line: node.at.line }
        : { node: node.id, file: fileOf(node) },
  );

  const position = new Map(placed.map(({ node }, at) => [node, at]));
  const parents = placed.map(({ parent }) => (parent === null ? null : (position.get(parent) ?? null)));

  return {
    id: world.def.id,
    ...(typeof world.def.name === "string" ? { name: world.def.name } : {}),
    ...(Array.isArray(world.def.source) ? { source: plain(world.def.source, index) as unknown[] } : {}),
    file: index,
    nodes,
    parents,
    placeholders: [...placeholders.values()],
    listings,
    orphans,
    files,
  };
}
