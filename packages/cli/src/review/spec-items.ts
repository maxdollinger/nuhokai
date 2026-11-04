/** The items of a node's spec a review cites, each by a stable reference. Pure. */
import type { Decision, Port, Requirement, TestCase } from "@nuhokai/world/node-spec";
import type { LoadedNode, LoadedWorld } from "../load/load-world.ts";
import { oneLine } from "../shared/failure.ts";

/** What a spec item is, as the prompt names it. */
export type SpecItemKind = "purpose" | "port" | "requirement" | "constraint" | "uses edge" | "test case" | "decision";

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
  /** The target's source entries that are strings, as written; none for an unreachable one. */
  readonly source: readonly string[];
  /** The target's purpose, empty for an unreachable one. */
  readonly purpose: string;
  /** The edge's index in the node's spec edges, for its line. */
  readonly edge: number;
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

/**
 * The uses edges of the node at `position`, in its edges' order, each with the name its item cites (R1, R6): the
 * target's name, its path when two targets share a name, and an unreachable target's export name (else its id).
 */
export function targets(world: LoadedWorld, position: number): Target[] {
  const node = world.nodes[position];
  if (node === undefined) return [];
  const edges = listOf<{ kind?: unknown; to?: unknown }>(node.spec.edges);
  const usesEdges = edges.flatMap((edge, index) => (edge?.kind === "uses" ? [index] : []));
  const found = node.uses.map((use, at) => {
    const target = use.to === null ? undefined : world.nodes[use.to];
    const edge = usesEdges[at] ?? -1;
    const id = textOf(edges[edge]?.to);
    const name = target?.spec.name ?? world.orphans.find((orphan) => orphan.id === id)?.name ?? id;
    const source = listOf<unknown>(target?.spec.source).filter((entry) => typeof entry === "string");
    const purpose = textOf(target?.spec.purpose);
    return { name, ports: use.port, edge, source, purpose, ...(target ? { node: target } : {}) };
  });
  // A name two targets share would cite either: those go by their path.
  return found.map((target) =>
    target.node && found.filter((other) => other.name === target.name).length > 1
      ? { ...target, name: target.node.path }
      : target,
  );
}

/**
 * One node's own items, each reference prefixed by `prefix` (a contract's name and a dot for inherited ones): ports,
 * requirements and test cases always, and with `own` its purpose, uses edges and decisions.
 */
function itemsOf(world: LoadedWorld, node: LoadedNode, own: boolean, prefix: string): SpecItem[] {
  const { spec, places } = node;
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
  if (own) add("purpose", "purpose", textOf(spec.purpose), places?.purpose);
  for (const [index, port] of listOf<Port>(spec.ports).entries()) {
    const text = `${textOf(port.kind)} port: ${textOf(port.purpose)}`;
    add(`ports.${port.name}`, "port", text, places?.ports[index], { details: portDetails(port) });
  }
  const testCases = listOf<TestCase>(spec.testCases);
  const demonstrated = new Set(testCases.flatMap((testCase) => listOf<string>(testCase?.demonstrates)));
  for (const [index, requirement] of listOf<Requirement>(spec.requirements).entries()) {
    const id = textOf(requirement?.id);
    const constraint = requirement?.kind === "constraint";
    const kind = constraint ? "constraint" : "requirement";
    const untested = !constraint && !demonstrated.has(id);
    add(`requirements[${id}]`, kind, textOf(requirement?.text), places?.requirements[index], { untested });
  }
  if (own) {
    for (const { name, ports, edge } of targets(world, node.index)) {
      add(`edges.uses[${name}]`, "uses edge", `uses ${name}: ${ports.join(", ")}`, places?.edges[edge]);
    }
  }
  for (const [index, testCase] of testCases.entries()) {
    const demonstrates = listOf<string>(testCase?.demonstrates);
    const shows = demonstrates.length > 0 ? ` (demonstrates ${demonstrates.join(", ")})` : "";
    add(`testCases[${index}]`, "test case", `${textOf(testCase?.text)}${shows}`, places?.testCases[index]);
  }
  if (own) {
    for (const [index, decision] of listOf<Decision>(spec.decisions).entries()) {
      const rejected = listOf<{ option?: unknown; why?: unknown }>(decision?.rejected).map(
        (option) => `rejected: ${textOf(option?.option)} Why not: ${textOf(option?.why)}`,
      );
      const text = `${textOf(decision?.decision)} Why: ${textOf(decision?.why)}`;
      add(`decisions[${index}]`, "decision", text, places?.decisions[index], { details: rejected });
    }
  }
  return items;
}

/**
 * Every item of the spec of the node at `position`, in spec order, the node's own first: its purpose, ports (their
 * shapes, errors and transport below each), requirements, uses edges, test cases and decisions (their rejected
 * options below each) (R1). Then each contract's ports, requirements and test cases, prefixed by the contract's name
 * (R2); a contract the walk never reached adds nothing. Each carries its spec file and line (R3); a requirement no
 * test case demonstrates is marked untested (R4), a uses edge to an orphan cited by its name (R6).
 */
export function list(world: LoadedWorld, position: number): SpecItem[] {
  const node = world.nodes[position];
  if (node === undefined) return [];
  const items = itemsOf(world, node, true, "");
  for (const contract of node.contracts) {
    const inherited = contract === null ? undefined : world.nodes[contract];
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
