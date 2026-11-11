/** The items of a node's spec a review cites, each by a stable reference. Pure. */
import type { Port } from "@nuhokai/world/node-spec";
import type { LoadedNode, LoadedUse, LoadedWorld } from "../load/load-world.ts";
import { oneLine } from "../shared/failure.ts";

/** What a spec item is, as the prompt names it. */
type SpecItemKind = "purpose" | "port" | "requirement" | "constraint" | "uses edge" | "test case" | "decision";

/** One item of a node's spec: its reference, what it says, and where it is written. */
export interface SpecItem {
  /** How a review cites it, by id or name where the format gives one: `requirements[R2]`, `Store.ports.keep`. */
  readonly ref: string;
  readonly kind: SpecItemKind;
  /** What it says, as written. */
  readonly text: string;
  /** What it holds below it, one line each, cited by the item's own reference: a port's shapes, a decision's rejected options. */
  readonly details?: readonly string[];
  /** Its spec file, cwd-relative: the node's, an inherited item's its contract's. */
  readonly file: string;
  /** Its line in `file`, else its node's node() line; absent when neither is known. */
  readonly line?: number;
  /** The contract's path, for an item inherited from it. */
  readonly contract?: string;
  /** A requirement no test case demonstrates: the format calls it a gap (R4). */
  readonly untested?: true;
}

/** One uses edge's target as a review names it: the node, or none when the world never reaches it. */
export interface Target {
  /** How its item cites it: the target's name, its path when two targets share a name; an orphan's export name. */
  readonly name: string;
  /** The ports used there. */
  readonly ports: readonly string[];
  /** The target, undefined when the world never reaches it (an orphan, R6). */
  readonly node?: LoadedNode;
}

/** A value as a list, empty when it is none: an unchecked world may hold anything. */
function listOf<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** A value as text, empty when it is none. */
function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A port's fields a review holds code to, one line each below the port (R1). */
function portDetails(port: Port): string[] {
  const fields = port as unknown as Partial<Record<string, unknown>>;
  const details: string[] = [];
  for (const key of ["input", "output"]) {
    if (typeof fields[key] === "string") details.push(`${key}: ${fields[key]}`);
  }
  for (const error of listOf<unknown>(fields.errors)) details.push(`error: ${textOf(error)}`);
  for (const key of ["payload", "transport"]) {
    if (typeof fields[key] === "string") details.push(`${key}: ${fields[key]}`);
  }
  return details;
}

/** A uses edge with the name its item cites, beside the edge as loaded. */
interface NamedUse {
  readonly use: LoadedUse;
  readonly name: string;
  readonly node?: LoadedNode;
}

/**
 * `node`'s uses edges, in its edges' order, each with the name its item cites (R1, R6): the target's name, its path
 * when two targets share a name, and an unreachable target's export name (else its id).
 */
function namedUses(world: LoadedWorld, node: LoadedNode): NamedUse[] {
  const found = node.uses.map((use): NamedUse => {
    const target = use.target === null ? undefined : world.nodes[use.target];
    const name = target?.spec.name ?? world.orphans.find((orphan) => orphan.id === use.to)?.name ?? use.to;
    return { use, name, ...(target ? { node: target } : {}) };
  });
  // A name two targets share would cite either: those go by their path.
  return found.map((named) =>
    named.node && found.filter((other) => other.name === named.name).length > 1
      ? { ...named, name: named.node.path }
      : named,
  );
}

/** `node`'s uses edges' targets, in its edges' order, each by the name its item cites (R1, R6). */
export function targets(world: LoadedWorld, node: LoadedNode): Target[] {
  return namedUses(world, node).map(({ use, name, node: target }) => ({
    name,
    ports: use.ports,
    ...(target ? { node: target } : {}),
  }));
}

/**
 * One node's own items, each reference prefixed by `prefix` (a contract's name and a dot for inherited ones): ports,
 * requirements and test cases always, and with `own` its purpose, uses edges and decisions.
 */
function itemsOf(world: LoadedWorld, node: LoadedNode, own: boolean, prefix: string): SpecItem[] {
  const { spec, places } = node;
  /** Where an item of the spec was written, by the item itself (LoadWorld R15). */
  const lineOf = (item: object) => places?.items.get(item);
  const items: SpecItem[] = [];
  type Extra = { details?: readonly string[]; untested?: boolean };
  const add = (ref: string, kind: SpecItemKind, text: string, line: number | undefined, extra: Extra = {}) => {
    const at = line ?? node.line;
    items.push({
      ref: `${prefix}${ref}`,
      kind,
      text,
      ...(extra.details?.length ? { details: extra.details } : {}),
      file: node.file,
      ...(at === undefined ? {} : { line: at }),
      ...(prefix ? { contract: node.path } : {}),
      ...(extra.untested ? { untested: true as const } : {}),
    });
  };
  if (own) add("purpose", "purpose", spec.purpose, places?.purpose);
  for (const port of spec.ports ?? []) {
    const text = `${textOf(port.kind)} port: ${textOf(port.purpose)}`;
    add(`ports.${port.name}`, "port", text, lineOf(port), { details: portDetails(port) });
  }
  // LoadWorld made these lists of objects (R16); what is inside each is as written, so checked here.
  const testCases = spec.testCases ?? [];
  const demonstrated = new Set(testCases.flatMap((testCase) => listOf<string>(testCase.demonstrates)));
  for (const requirement of spec.requirements ?? []) {
    const id = textOf(requirement.id);
    const constraint = requirement.kind === "constraint";
    const kind = constraint ? "constraint" : "requirement";
    // Only the node's own: an implementor's test cases demonstrate its own ids, never its contracts' (R4).
    const untested = own && !constraint && !demonstrated.has(id);
    add(`requirements[${id}]`, kind, textOf(requirement.text), lineOf(requirement), { untested });
  }
  if (own) {
    for (const { use, name } of namedUses(world, node)) {
      add(`edges.uses[${name}]`, "uses edge", `uses ${name}: ${use.ports.join(", ")}`, use.line);
    }
  }
  for (const [index, testCase] of testCases.entries()) {
    const demonstrates = listOf<string>(testCase.demonstrates);
    const shows = demonstrates.length > 0 ? ` (demonstrates ${demonstrates.join(", ")})` : "";
    add(`testCases[${index}]`, "test case", `${textOf(testCase.text)}${shows}`, lineOf(testCase));
  }
  if (own) {
    for (const [index, decision] of (spec.decisions ?? []).entries()) {
      const rejected = listOf<{ option?: unknown; why?: unknown }>(decision.rejected).map(
        (option) => `rejected: ${textOf(option?.option)} Why not: ${textOf(option?.why)}`,
      );
      const text = `${textOf(decision.decision)} Why: ${textOf(decision.why)}`;
      add(`decisions[${index}]`, "decision", text, lineOf(decision), { details: rejected });
    }
  }
  return items;
}

/**
 * Every item of `node`'s spec, in spec order, the node's own first: its purpose, ports (their
 * shapes, errors and transport below each), requirements, uses edges, test cases and decisions (their rejected
 * options below each) (R1). Then each contract's ports, requirements and test cases, prefixed by the contract's name
 * (R2); a contract the walk never reached adds nothing. Each carries its spec file and line (R3); a requirement no
 * test case demonstrates is marked untested (R4), a uses edge to an orphan cited by its name (R6).
 */
export function list(world: LoadedWorld, node: LoadedNode): SpecItem[] {
  const items = itemsOf(world, node, true, "");
  for (const { target } of node.contracts) {
    const inherited = target === null ? undefined : world.nodes[target];
    if (inherited) items.push(...itemsOf(world, inherited, false, `${inherited.spec.name}.`));
  }
  return items;
}

/**
 * The item a reference names as the prompt prints it (Failure's oneLine), exactly and case-sensitive (R5); undefined
 * when none does.
 */
export function find(items: readonly SpecItem[], ref: string): SpecItem | undefined {
  return items.find((item) => oneLine(item.ref) === ref);
}
