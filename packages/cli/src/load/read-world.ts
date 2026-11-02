/**
 * PROTOTYPE: read a world without running it.
 *
 * loadWorld (load-world.ts) evaluates every world file with Bun and walks the handles. readWorld answers the same
 * LoadedWorld by reading the files instead: the CLI's pinned checker parses them and resolves every name to its
 * declaration, and the calls a world file may make (node, .edges, defineWorld, tbd.call, tbd.event, inherited) are
 * read as data. Nothing in a world file runs, so import cycles, lazy edges and a sandbox stop mattering.
 *
 * What it reads is what TypeCheck R2 already allows: literals, objects, arrays, spreads, string `+` and templates,
 * `as const`, consts, imports between world files, and arrow functions whose body is an expression or one `return`.
 * Anything else is a CliError at its file and line.
 */
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
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
  isExportAssignment,
  isFunctionExpression,
  isIdentifier,
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
  isVariableDeclaration,
  type Node,
  type SourceFile,
  SyntaxKind,
} from "typescript/unstable/ast";
import { API, type Project, SymbolFlags, type Symbol as TsSymbol } from "typescript/unstable/async";
import { checkerPath } from "../check/type-check.ts";
import { CliError, oneLine } from "../shared/failure.ts";
import { requireWorld } from "../shared/inspect.ts";
import { inWorld, WORLD_INDEX, WORLD_TSCONFIG } from "../shared/paths.ts";
import type { Listing, LoadedWorld, NodeFile, Orphan, Placeholder } from "./load-world.ts";
import { worldFiles } from "./load-world.ts";

/** The functions a world file may call, as @nuhokai/world declares them. */
const WORLD_FUNCTIONS = new Set(["node", "defineWorld", "inherited", "tbd"]);

// ─── Values ──────────────────────────────────────────────────────────────

/** A value read from a world file: data, or one of the format's objects. */
type Val = undefined | null | boolean | number | string | readonly Val[] | Rec | Ref;
interface Rec {
  readonly [key: string]: Val;
}
type Ref = WorldFn | Draft | EdgesFn | Fn | NodeV | PortsNs | PortV | InheritedV | HoleV | WorldV | ChildrenParam;

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
  children?: Promise<Rec | undefined>;
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
/** A dome's `c`: its children by name. */
class ChildrenParam {
  constructor(readonly dome: NodeV) {}
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
    const resolved = await Promise.all(
      [...new Set(this.symbols.values())].flatMap((symbol) => (symbol ? [this.target(symbol)] : [])),
    );
    await Promise.all(resolved.map((target) => this.declarationOf(target)));
  }

  /** A symbol's value declaration (else its first), resolved to its node once. */
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
        const name = property.name as Identifier;
        withKey(record, name.text, await this.identifier(name, env));
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
  private async identifier(id: Identifier, env: Env): Promise<Val> {
    if (id.text === "undefined") return undefined;
    const checker = this.project.checker;
    const symbol = this.symbols.has(id) ? this.symbols.get(id) : await checker.getSymbolAtLocation(id);
    if (!symbol) throw this.fail(id, `'${id.text}' refers to nothing the checker knows`);
    const target = await this.target(symbol);
    const declaration = await this.declarationOf(target);
    if (!declaration) throw this.fail(id, `'${id.text}' has no declaration`);
    const file = declaration.getSourceFile();
    if (this.nameOf(file) === undefined) {
      if (WORLD_FUNCTIONS.has(target.name)) return new WorldFn(target.name);
      throw this.fail(id, `'${id.text}' is declared outside the world (${file.fileName})`);
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

  private async member(object: Val, name: string, where: Node): Promise<Val> {
    if (object instanceof WorldFn && object.name === "tbd" && (name === "call" || name === "event")) {
      return new WorldFn(`tbd.${name}`);
    }
    if (object instanceof Draft && name === "edges") return new EdgesFn(object);
    if (object instanceof NodeV) return name === "ports" ? new PortsNs(object) : new PortV(object, name);
    if (object instanceof PortsNs) return new PortV(object.node, name);
    if (object instanceof ChildrenParam) {
      const children = await this.childrenOf(object.dome);
      if (children && Object.hasOwn(children, name)) return children[name];
      throw this.fail(where, `\`${name}\` is not one of this dome's children`);
    }
    if (isRec(object)) return Object.hasOwn(object, name) ? object[name] : undefined;
    throw this.fail(where, `cannot read .${name} here without running it`);
  }

  private async call(expr: CallExpression, env: Env): Promise<Val> {
    const callee = await this.read(expr.expression, env);
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
    if (!(callee instanceof WorldFn)) throw this.fail(expr, "the only calls here are the world format's functions");
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

  /** A node's direct children: its `children` function's record (or an authored record), read once. */
  childrenOf(node: NodeV): Promise<Rec | undefined> {
    node.children ??= (async () => {
      const children = node.def.children;
      if (children === undefined) return undefined;
      const record = children instanceof Fn ? await this.apply(children, []) : children;
      if (!isRec(record)) throw new CliError(`${node.at.file}:${node.at.line}: children is not a record of nodes`);
      return record;
    })();
    return node.children;
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
      if (!(ports instanceof Fn)) throw new CliError(`${where}: a dome's ports are a function of its children`);
      const exposed = await this.apply(ports, [new ChildrenParam(node)]);
      if (!isRec(exposed)) throw new CliError(`${where}: a dome's ports return a record of its children's ports`);
      const children = Object.values((await this.childrenOf(node)) ?? {});
      const resolved: Record<string, Rec> = {};
      for (const [name, ref] of Object.entries(exposed)) {
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

  /** Each export of a world file, by name in code-unit order (as a module namespace lists them), with its value. */
  async exportsOf(file: SourceFile): Promise<[string, Val][]> {
    const checker = this.project.checker;
    const module = this.symbols.has(file) ? this.symbols.get(file) : await checker.getSymbolAtLocation(file);
    if (!module) return [];
    const exports: [string, Val][] = [];
    const symbols = [...(await checker.getExportsOfModule(module))].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
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

/** Plain data as the loader answers it; a format object where data belongs is a CliError at `where`. */
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
 * PROTOTYPE of loadWorld that runs nothing: the same LoadedWorld for the project directory `root`, named from the
 * cwd, read from nuhokai/ with the pinned checker and nuhokai/tsconfig.json.
 */
export async function readWorld(root: string, checker: () => string = checkerPath): Promise<LoadedWorld> {
  requireWorld(root);
  const index = inWorld(root, WORLD_INDEX);
  if (!existsSync(index)) throw new CliError(`${index}: not found; it is the world's entry point`);
  const tsconfig = inWorld(root, WORLD_TSCONFIG);
  if (!existsSync(tsconfig)) throw new CliError(`${tsconfig}: not found; run \`nuhokai init\` to restore it`);

  const paths = worldFiles(root).map((path) => inWorld(root, path));
  const names = new Map<string, string>();
  for (const name of paths) {
    names.set(resolve(name), name);
    names.set(realpathSync(name), name);
  }

  const api = new API({ cwd: resolve(root), tsserverPath: checker() });
  try {
    const config = resolve(tsconfig);
    const snapshot = await api.updateSnapshot({ openProject: config });
    const project = snapshot.getProject(config);
    if (!project) throw new CliError(`${tsconfig}: the type checker opened no project for it`);
    const program = project.program;
    const files = await Promise.all(
      paths.map(async (name): Promise<[string, SourceFile]> => {
        const file = (await program.getSourceFile(resolve(name))) ?? (await program.getSourceFile(realpathSync(name)));
        if (!file)
          throw new CliError(`${name}: not in the project of ${tsconfig}; its include must cover every world file`);
        return [name, file];
      }),
    );
    // A file that does not parse is a load error at its first syntax error, as evaluating it was.
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
    return await worldOf(reader, files, index);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`the type checker failed: ${oneLine(error)}`);
  } finally {
    await api.close().catch(() => {});
  }
}

/** The LoadedWorld from the read files, by the loader's rules (LoadWorld R2–R10). */
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
      await place(Object.values((await lazily(child, "children", () => reader.childrenOf(child))) ?? {}), child);
    }
  };
  /** A lazy part of a node, read; a failure is a load error about the node's file, as the loader words it. */
  const lazily = async <T>(node: NodeV, field: string, read: () => Promise<T>): Promise<T> => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof CliError && /^\S+:\d+: /.test(error.message)) throw error;
      throw new CliError(`${fileOf(node)}: ${nameOf(node)}.${field}: ${oneLine(error)}`);
    }
  };
  await place(world.def.children, null);

  const placeholders = new Map<HoleV, Placeholder>();
  const edgeList = async (node: NodeV, edge: "uses" | "implements"): Promise<readonly Val[]> => {
    // Both steps merged, as the runtime keeps them in $def: an edge may sit in either.
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
