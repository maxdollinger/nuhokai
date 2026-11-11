/**
 * Reading world files as values, never running them: the format's objects (node drafts, nodes, ports, tbd placeholders, the
 * world), and the Reader, which evaluates the one subset of TypeScript a world file may hold, asking the checker what
 * each name refers to. LoadWorld builds the world from what it reads.
 */
import { resolve } from "node:path";
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
import { CliError } from "../shared/failure.ts";
import { compareText } from "../shared/world-path.ts";

/** A 1-based line and column in a world file. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

/**
 * A world that cannot be read, at a world file and, when known, its line and column: the message is
 * `<file>:<line>: <rule>` (or `<file>: <rule>`), no column, as every finding line, so a command that prints it as a
 * failure line needs nothing else; check reports it as a finding of its own, the column telling its very position
 * (CheckWorld R6). Typed apart instead of recognised by its text: a project directory
 * may hold spaces or colons.
 */
export class LoadError extends CliError {
  readonly line?: number;
  readonly column?: number;

  constructor(
    readonly file: string,
    at: Position | undefined,
    readonly rule: string,
    /** Other places in `file` where tsc reports the same break (a bad children item: at the `children:` property). */
    readonly alsoAt: readonly Position[] = [],
  ) {
    super(at === undefined ? `${file}: ${rule}` : `${file}:${at.line}: ${rule}`);
    this.name = "LoadError";
    if (at !== undefined) {
      this.line = at.line;
      this.column = at.column;
    }
  }
}

/**
 * Where a source list was written, for findings about it: the `source:` property, and each entry in list order. A
 * position is absent where the value was written in another file than its owner's (a shared const imported).
 */
export interface SourcePlaces {
  readonly at?: Line;
  readonly entries: readonly (Line | undefined)[];
}

/** A 1-based line in a world file: where the loaded world says something was written. */
export interface Line {
  readonly line: number;
}

/** A name that resolves to no declaration in the world: as a callee, it is a call the format does not allow. */
class UnknownName extends LoadError {}

/** The 1-based line and column of a position in a parsed file. */
export function positionIn(file: SourceFile, position: number): Position {
  const { line, character } = file.getLineAndCharacterOfPosition(position);
  return { line: line + 1, column: character + 1 };
}

/** A place in a world file as a message names it: `nuhokai/a.ts:3`. */
function placeText(at: At): string {
  return `${at.file}:${at.line}`;
}

/** A syntax kind in words, with its article: SyntaxKind.ExpressionStatement → "an expression statement". */
function kindInWords(kind: SyntaxKind): string {
  const words = String(SyntaxKind[kind])
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return `${/^[aeiou]/.test(words) ? "an" : "a"} ${words}`;
}

/** A node's source text as one line, cut to 40 characters: what a load error quotes of the code it cannot read. */
function codeOf(node: Node): string {
  const file = node.getSourceFile();
  const text = file.text.slice(node.getStart(file), node.end).replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

/** The functions a world file may call, imported from @nuhokai/world under their own name. */
const WORLD_FUNCTIONS = new Set(["node", "defineWorld", "inherited", "tbd"]);
const ALLOWED_CALLS = "node, .edges, defineWorld, tbd.call, tbd.event and inherited";

/** Why a function in a world file has no parameters, and what to write instead. */
const FUNCTION_PARAMETERS =
  "a function in a world file takes no parameters: it is never called, only read as an edge's list; write uses: () => [A.run], and each node out as data";

// ─── Values ──────────────────────────────────────────────────────────────

/** One export of a world file: its name, its value, and whether its declaration makes that value. */
export interface Export {
  readonly name: string;
  readonly value: Val;
  readonly own: boolean;
}

/** A value read from a world file: data, or one of the format's objects. */
export type Val = undefined | null | boolean | number | string | readonly Val[] | Rec | Ref;
export interface Rec {
  readonly [key: string]: Val;
}
type Ref = WorldFn | Draft | EdgesFn | Fn | NodeV | PortsNs | PortV | InheritedV | PlaceholderV | WorldV;

/** Where a value was made: a file named from the cwd, and a 1-based line and column. */
export interface At extends Position {
  readonly file: string;
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
export class Fn {
  constructor(
    readonly node: ArrowFunction | FunctionExpression,
    readonly env: Env,
  ) {}
}
/** node(def).edges(edges): a node, by identity. */
export class NodeV {
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
export class PortV {
  constructor(
    readonly node: NodeV,
    readonly name: string,
  ) {}
}
/** inherited(node, contract port). */
export class InheritedV {
  constructor(
    readonly node: Val,
    readonly port: Val,
  ) {}
}
/** tbd.call or tbd.event: a placeholder, by identity. */
export class PlaceholderV {
  constructor(
    readonly at: At,
    readonly kind: "call" | "event",
    readonly description: Val,
  ) {}
}
/** defineWorld(def). */
export class WorldV {
  constructor(
    readonly at: At,
    readonly def: Rec,
  ) {}
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
function withKey<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
}

// ─── Reading ─────────────────────────────────────────────────────────────

export class Reader {
  /** Where each item of a list was written, by the list read from a literal (spread items keep their own). */
  private readonly itemPlaces = new WeakMap<readonly Val[], readonly At[]>();
  /** Where each item of a list came into it: the item itself, or the `...spread` element that brought it in. */
  private readonly spreadPlaces = new WeakMap<readonly Val[], readonly At[]>();
  /** Where each property of a record was written, by the record read from a literal. */
  private readonly propertyPlaces = new WeakMap<Rec, ReadonlyMap<string, At>>();
  /** Each const's value, by its declaration: read once, so a node read twice is one node. */
  private readonly declared = new Map<Node, Promise<Val>>();
  /**
   * Each .edges() and tbd call's value, by the call: one object per call, as nothing calls a function of the world's
   * own, so a node() call in the code is exactly one node and a tbd call one placeholder.
   */
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

  /** Where a record's property was written, if the record was read from a literal. */
  propertyAt(record: Rec, key: string): At | undefined {
    return this.propertyPlaces.get(record)?.get(key);
  }

  /** Where a list's item was written, if the list was read from a literal. */
  itemAt(list: readonly Val[], index: number): At | undefined {
    return this.itemPlaces.get(list)?.[index];
  }

  /**
   * Where a list's item is in `file`: where it was written when that is there, else the `...spread` element in the
   * list's own literal that brought it in, when that is there; undefined otherwise.
   */
  itemIn(list: readonly Val[], index: number, file: string): At | undefined {
    const written = this.itemAt(list, index);
    if (written?.file === file) return written;
    const spread = this.spreadPlaces.get(list)?.[index];
    return spread?.file === file ? spread : undefined;
  }

  /**
   * Where a record's `key` and the items of the list it holds were written, as positions in `file`; a place in
   * another file is left out.
   */
  sourcePlaces(record: Rec, key: string, file: string): SourcePlaces {
    const inFile = (at: At | undefined): Line | undefined => (at?.file === file ? { line: at.line } : undefined);
    const value = record[key];
    const at = inFile(this.propertyPlaces.get(record)?.get(key));
    const entries = Array.isArray(value) ? value.map((_item, index) => inFile(this.itemIn(value, index, file))) : [];
    return at ? { at, entries } : { entries };
  }

  /** A file's name from the cwd, or undefined outside the world. */
  printedName(file: SourceFile): string | undefined {
    return this.names.get(file.fileName) ?? this.names.get(resolve(file.fileName));
  }

  at(node: Node): At {
    const file = node.getSourceFile();
    return {
      file: this.printedName(file) ?? file.fileName,
      ...positionIn(file, node.getStart(file)),
    };
  }

  fail(node: Node, message: string): LoadError {
    const at = this.at(node);
    return new LoadError(at.file, at, message);
  }

  /** A load error for code the loader cannot read, quoting it: "not an expression statement: `console.log(1)`". */
  failCode(node: Node, message: string): LoadError {
    return this.fail(node, `${message}${kindInWords(node.kind)}: \`${codeOf(node)}\``);
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
      const places: At[] = [];
      const spreads: At[] = [];
      for (const element of expr.elements) {
        if (isSpreadElement(element)) {
          const spread = await this.read(element.expression, env);
          if (!Array.isArray(spread)) throw this.fail(element, "only an array spreads into an array");
          const inner = this.itemPlaces.get(spread);
          items.push(...spread);
          places.push(...spread.map((_item, index) => inner?.[index] ?? this.at(element)));
          spreads.push(...spread.map(() => this.at(element)));
        } else {
          items.push(await this.read(element, env));
          places.push(this.at(element));
          spreads.push(this.at(element));
        }
      }
      this.itemPlaces.set(items, places);
      this.spreadPlaces.set(items, spreads);
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
    if (isArrowFunction(expr) || isFunctionExpression(expr)) {
      // A function is only ever read as an edge's list, never called: one with parameters can only be a factory.
      const [parameter] = expr.parameters;
      if (parameter) throw this.fail(parameter, FUNCTION_PARAMETERS);
      return new Fn(expr, env);
    }
    throw this.failCode(expr, "a world file holds data only, so this cannot be read without running it: ");
  }

  private async object(properties: Iterable<Node>, env: Env): Promise<Rec> {
    const record: Record<string, Val> = {};
    const places = new Map<string, At>();
    this.propertyPlaces.set(record, places);
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
        places.set(String(key), this.at(property));
      } else if (isShorthandPropertyAssignment(property)) {
        // `{ id }`: the name's own symbol is the property; its value is the variable's.
        const name = property.name as Identifier;
        const symbol = await this.project.checker.getShorthandAssignmentValueSymbol(property);
        withKey(record, name.text, await this.identifier(name, env, symbol));
        places.set(name.text, this.at(property));
      } else if (isSpreadAssignment(property)) {
        const spread = await this.read(property.expression, env);
        if (!isRec(spread)) throw this.fail(property, "only a plain object spreads into an object");
        const inner = this.propertyPlaces.get(spread);
        for (const [key, value] of Object.entries(spread)) {
          withKey(record, key, value);
          places.set(key, inner?.get(key) ?? this.at(property));
        }
      } else {
        throw this.failCode(property, "an object in a world file holds data only, not ");
      }
    }
    return record;
  }

  /** What a name refers to: a parameter in scope, a const (read once), or a function of @nuhokai/world. */
  private async identifier(id: Identifier, env: Env, known?: TsSymbol): Promise<Val> {
    if (id.text === "undefined") return undefined;
    const checker = this.project.checker;
    const symbol = known ?? (this.symbols.has(id) ? this.symbols.get(id) : await checker.getSymbolAtLocation(id));
    if (!symbol) {
      const at = this.at(id);
      throw new UnknownName(
        at.file,
        at,
        `'${id.text}' is declared nowhere; declare it in a world file, or import it from one`,
      );
    }
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
      // At the import, where the fix is: TypeCheck R2 refuses the same import there.
      throw this.fail(
        importOf(local) ?? id,
        `'${id.text}' comes from '${from}'; a world file reads only world files and @nuhokai/world`,
      );
    }
    const target = await this.target(symbol);
    const declaration = await this.declarationOf(target);
    if (!declaration) {
      const at = this.at(id);
      throw new UnknownName(
        at.file,
        at,
        `'${id.text}' is imported, but its file or export is missing; fix the import, or export ${id.text} from the file it names`,
      );
    }
    const file = declaration.getSourceFile();
    if (this.printedName(file) === undefined) {
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
    // Before the cache: a value met again while it is being read is a cycle, and its pending read would await itself.
    if (this.reading.has(declaration)) throw this.fail(from, "a value refers to itself while being read");
    const known = this.declared.get(declaration);
    if (known) return known;
    let value: Promise<Val>;
    if (isVariableDeclaration(declaration)) {
      const initializer = declaration.initializer;
      if (!initializer) throw this.fail(declaration, "a const read here needs a value");
      value = this.read(initializer, NO_ENV);
    } else if (isExportAssignment(declaration)) {
      value = this.read(declaration.expression, NO_ENV);
    } else {
      throw this.fail(
        from,
        `cannot read ${kindInWords(declaration.kind)} without running it: \`${codeOf(from)}\` is declared at ${placeText(this.at(declaration))}`,
      );
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
      const callee = codeOf(expr.expression);
      return this.fail(
        expr,
        `world files are declarative: they call only ${ALLOWED_CALLS}, not ${callee}(...); write what it would make out as data`,
      );
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
    // A function of the world's own is a value to read (an edge's arrow), never one to call: calling it would be
    // running the world (scopes, identity per call, recursion), and a node() call is exactly one node.
    if (callee instanceof Fn) throw notAllowed();
    const args: Val[] = [];
    for (const arg of expr.arguments) {
      if (isSpreadElement(arg)) throw this.fail(arg, "a call here takes no spread");
      args.push(await this.read(arg, env));
    }
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
        return new WorldV(this.at(expr), arg);
      case "inherited":
        return new InheritedV(args[0], args[1]);
      case "tbd.call":
      case "tbd.event":
        return this.once(
          expr,
          () =>
            new PlaceholderV(
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

  /**
   * What an edge's arrow lists (`uses: () => [A.run]`): its expression body, or the one `return` of its block, read
   * as data where the arrow was written. It is never applied to arguments: it takes none, so no world file can recurse.
   */
  async edgeValue(fn: Fn): Promise<Val> {
    const env = fn.env;
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
      throw new LoadError(node.at.file, node.at, "children is a list of nodes: children: [A, B]");
    }
    return children;
  }

  /** A node's port definitions: a leaf's as authored; a dome's copied from its children's, each with its delegate. */
  portsOf(node: NodeV): Promise<Readonly<Record<string, Rec>>> {
    node.ports ??= (async () => {
      const ports = node.def.ports;
      const fail = (rule: string) => new LoadError(node.at.file, node.at, rule);
      if (node.def.children === undefined) {
        if (ports === undefined) return {};
        if (!isRec(ports)) throw fail("a leaf's ports are a record of port definitions");
        return ports as Record<string, Rec>;
      }
      if (ports === undefined) return {};
      if (!isRec(ports)) {
        throw fail("a dome's ports are a record of its children's ports: ports: { run: A.run }");
      }
      const children = this.childrenOf(node);
      const resolved: Record<string, Rec> = {};
      for (const [name, ref] of Object.entries(ports)) {
        const child = ref instanceof PortV || ref instanceof InheritedV ? ref.node : undefined;
        if (!(child instanceof NodeV) || !children.includes(child)) {
          throw fail(`\`${name}\` exposes a port of a node that is not one of this dome's direct children`);
        }
        const port = ref instanceof InheritedV ? (ref.port instanceof PortV ? ref.port : undefined) : (ref as PortV);
        if (!port) throw fail(`\`${name}\` inherits no port`);
        const source = (await this.portsOf(port.node))[port.name];
        if (!source) throw fail(`\`${port.name}\` is not a port of its node`);
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
        throw this.failCode(statement, "world files hold only imports, exports and declarations of data, not ");
      }
    }
  }

  /** Every node read so far, in the order its .edges() call was first read. */
  nodes(): NodeV[] {
    return [...this.made.values()].filter((value): value is NodeV => value instanceof NodeV);
  }

  /**
   * Each export of a world file, by name in code-unit order (as a module namespace lists them), with its value and
   * whether its declaration makes that value: `own` when the node() or tbd call is written inside it, never for an
   * alias such as `export const B = A`.
   */
  async exportsOf(file: SourceFile): Promise<Export[]> {
    const checker = this.project.checker;
    const module = this.symbols.has(file) ? this.symbols.get(file) : await checker.getSymbolAtLocation(file);
    if (!module) return [];
    const exports: Export[] = [];
    // Code-unit order, as a module namespace lists its exports: the same on every machine and locale.
    const symbols = [...(await checker.getExportsOfModule(module))].sort((a, b) => compareText(a.name, b.name));
    for (const symbol of symbols) {
      const target = await this.target(symbol);
      const declaration = target.valueDeclaration && (await this.declarationOf(target));
      if (!declaration || this.printedName(declaration.getSourceFile()) === undefined) continue;
      if (!isVariableDeclaration(declaration) && !isExportAssignment(declaration)) continue;
      const value = await this.declaration(declaration, declaration);
      // A re-export under another name (`export { A as B }`) resolves to A's declaration, but does not make A.
      const declared = isVariableDeclaration(declaration) && isIdentifier(declaration.name) && declaration.name.text;
      const own = declared === symbol.name && this.makes(declaration, value);
      exports.push({ name: symbol.name, value, own });
    }
    return exports;
  }

  /** Whether `value`, a node or placeholder, was made by a call written inside `declaration`. */
  private makes(declaration: Node, value: Val): boolean {
    if (!(value instanceof NodeV || value instanceof PlaceholderV)) return false;
    const start = this.at(declaration);
    const end = positionIn(declaration.getSourceFile(), declaration.end);
    const { at } = value;
    const after = (a: Position, b: Position) => a.line > b.line || (a.line === b.line && a.column >= b.column);
    return at.file === start.file && after(at, start) && after(end, at);
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

/** The import declaration an import binding belongs to, if `declaration` is one. */
function importOf(declaration: Node | undefined): (Node & { moduleSpecifier: Node }) | undefined {
  let at = declaration;
  while (at && !isImportDeclaration(at)) {
    if (at.kind !== SyntaxKind.ImportSpecifier && at.kind !== SyntaxKind.NamedImports) {
      if (at.kind !== SyntaxKind.ImportClause && at.kind !== SyntaxKind.NamespaceImport) return undefined;
    }
    at = at.parent;
  }
  return at;
}

/** The module an import binding comes from, if `declaration` is one. */
function importedFrom(declaration: Node | undefined): string | undefined {
  const declared = importOf(declaration);
  return declared && isStringLiteral(declared.moduleSpecifier) ? declared.moduleSpecifier.text : undefined;
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

/** What a value is, for a load error that found it where a node belongs. */
export function valueInWords(value: Val): string {
  if (value instanceof Draft) return "a draft: node(...) without .edges(...)";
  if (value instanceof PortV || value instanceof InheritedV) return "a port";
  if (value instanceof NodeV) return "a node";
  if (value instanceof WorldV) return "the world";
  if (value instanceof PlaceholderV) return "a tbd placeholder";
  if (typeof value === "string") return `the string ${JSON.stringify(value)}`;
  if (value === undefined) return "undefined";
  return Array.isArray(value) ? "a list" : `${typeof value === "object" ? "an object" : `the ${typeof value}`}`;
}

function isPrimitive(value: Val): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/**
 * Plain data, as NodeSpec holds it, from `value` at `path` (`Orders.requirements[0]`). A format object where data
 * belongs is a LoadError naming its path and what it is, at the item or property it sits in when the reader knows it,
 * else at `where`.
 */
export function plain(reader: Reader, value: Val, where: At, path: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => plain(reader, item, reader.itemAt(value, index) ?? where, `${path}[${index}]`));
  }
  if (isRec(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      withKey(out, key, plain(reader, item, reader.propertyAt(value, key) ?? where, `${path}.${key}`));
    }
    return out;
  }
  if (typeof value === "object" && value !== null) {
    const rule = `${path} holds ${valueInWords(value)} where data belongs; write strings, numbers, booleans, lists and objects there`;
    throw new LoadError(where.file, where, rule);
  }
  return value;
}
