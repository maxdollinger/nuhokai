/** The items of a node's spec a review cites, each by a stable reference. Pure. */
import type { Decision, Port, Requirement, TestCase } from "@nuhokai/world/node-spec";
import type { LoadedNode, LoadedWorld } from "../load/load-world.ts";

/** What a spec item is, as the prompt names it. */
export type SpecItemKind =
  | "purpose"
  | "port"
  | "port field"
  | "requirement"
  | "constraint"
  | "uses edge"
  | "test case"
  | "decision"
  | "rejected option";

/** One item of a node's spec: its reference, what it says, and where it is written. */
export interface SpecItem {
  /** How a review cites it, by id or name where the format gives one: `requirements[R2]`, `Store.ports.keep`. */
  readonly ref: string;
  readonly kind: SpecItemKind;
  /** What it says, as written. */
  readonly text: string;
  /** Its spec file, cwd-relative: the node's, an inherited item's its contract's. */
  readonly file: string;
  /** Its line in `file`, else its node's node() line; absent when neither is known. */
  readonly line?: number;
  /** The contract's path, for an item inherited from it. */
  readonly contract?: string;
  /** A requirement no test case demonstrates: the format calls it a gap (R4). */
  readonly untested?: true;
}

/** A value as a list, empty when it is none: an unchecked world may hold anything. */
function listOf<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** A value as text, empty when it is none. */
function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A port's fields a review holds code to, each with its reference below the port's. */
function portFields(port: Port): [suffix: string, text: string][] {
  const fields: [string, string][] = [];
  const field = (key: "input" | "output" | "payload" | "transport") => {
    const value = (port as unknown as Partial<Record<string, unknown>>)[key];
    if (typeof value === "string") fields.push([`.${key}`, value]);
  };
  field("input");
  field("output");
  for (const [index, error] of listOf<unknown>((port as { errors?: unknown }).errors).entries()) {
    fields.push([`.errors[${index}]`, textOf(error)]);
  }
  field("payload");
  field("transport");
  return fields;
}

/**
 * One node's own items, each reference prefixed by `prefix` (a contract's name and a dot for inherited ones): ports,
 * requirements and test cases always, and with `own` its purpose, uses edges and decisions.
 */
function itemsOf(world: LoadedWorld, node: LoadedNode, own: boolean, prefix: string): SpecItem[] {
  const { spec, places } = node;
  const items: SpecItem[] = [];
  const add = (ref: string, kind: SpecItemKind, text: string, line: number | undefined, untested = false) => {
    const at = line ?? node.line;
    items.push({
      ref: `${prefix}${ref}`,
      kind,
      text,
      file: node.file,
      ...(at === undefined ? {} : { line: at }),
      ...(prefix ? { contract: node.path } : {}),
      ...(untested ? { untested: true as const } : {}),
    });
  };
  if (own) add("purpose", "purpose", textOf(spec.purpose), places?.purpose);
  for (const [index, port] of listOf<Port>(spec.ports).entries()) {
    const line = places?.ports[index];
    const ref = `ports.${port.name}`;
    add(ref, "port", `${textOf(port.kind)} port: ${textOf(port.purpose)}`, line);
    for (const [suffix, text] of portFields(port)) add(`${ref}${suffix}`, "port field", text, line);
  }
  const testCases = listOf<TestCase>(spec.testCases);
  const demonstrated = new Set(testCases.flatMap((testCase) => listOf<string>(testCase?.demonstrates)));
  for (const [index, requirement] of listOf<Requirement>(spec.requirements).entries()) {
    const id = textOf(requirement?.id);
    const constraint = requirement?.kind === "constraint";
    const kind = constraint ? "constraint" : "requirement";
    const untested = !constraint && !demonstrated.has(id);
    add(`requirements[${id}]`, kind, textOf(requirement?.text), places?.requirements[index], untested);
  }
  if (own) {
    const usesEdges = listOf<{ kind?: unknown; to?: unknown }>(spec.edges).flatMap((edge, index) =>
      edge?.kind === "uses" ? [index] : [],
    );
    const targets = node.uses.map((use, at) => {
      const target = use.to === null ? undefined : world.nodes[use.to];
      const edge = listOf<{ to?: unknown }>(spec.edges)[usesEdges[at] ?? -1];
      return { use, at, target, name: target?.spec.name ?? textOf(edge?.to) };
    });
    for (const { use, at, target, name } of targets) {
      // A name two targets share would cite either: those go by their path.
      const shared = targets.filter((other) => other.name === name).length > 1;
      const label = shared && target ? target.path : name;
      const line = places?.edges[usesEdges[at] ?? -1];
      add(`edges.uses[${label}]`, "uses edge", `uses ${label}: ${use.port.join(", ")}`, line);
    }
  }
  for (const [index, testCase] of testCases.entries()) {
    const demonstrates = listOf<string>(testCase?.demonstrates);
    const shows = demonstrates.length > 0 ? ` (demonstrates ${demonstrates.join(", ")})` : "";
    add(`testCases[${index}]`, "test case", `${textOf(testCase?.text)}${shows}`, places?.testCases[index]);
  }
  if (own) {
    for (const [index, decision] of listOf<Decision>(spec.decisions).entries()) {
      const line = places?.decisions[index];
      add(`decisions[${index}]`, "decision", `${textOf(decision?.decision)} Why: ${textOf(decision?.why)}`, line);
      for (const [option, rejected] of listOf<{ option?: unknown; why?: unknown }>(decision?.rejected).entries()) {
        const text = `${textOf(rejected?.option)} Why not: ${textOf(rejected?.why)}`;
        add(`decisions[${index}].rejected[${option}]`, "rejected option", text, line);
      }
    }
  }
  return items;
}

/**
 * Every item of the spec of the node at `position`, in spec order, the node's own first: its purpose, ports with
 * their fields, requirements, uses edges, test cases and decisions with their rejected options (R1). Then each
 * contract's ports, requirements and test cases, prefixed by the contract's name (R2); a contract the walk never
 * reached adds nothing. Each carries its spec file and line (R3); a requirement no test case demonstrates is marked
 * untested (R4).
 */
export function listItems(world: LoadedWorld, position: number): SpecItem[] {
  const node = world.nodes[position];
  if (node === undefined) return [];
  const items = itemsOf(world, node, true, "");
  for (const contract of node.contracts) {
    const inherited = contract === null ? undefined : world.nodes[contract];
    if (inherited) items.push(...itemsOf(world, inherited, false, `${inherited.spec.name}.`));
  }
  return items;
}

/** The item a reference names, exactly and case-sensitive (R5); undefined when none does. */
export function findItem(items: readonly SpecItem[], ref: string): SpecItem | undefined {
  return items.find((item) => item.ref === ref);
}
