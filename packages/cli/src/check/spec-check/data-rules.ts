import type { NodeSpec } from "@nuhokai/world/node-spec";
import type { Listing, LoadedNode, LoadedWorld } from "../../load/load-world.ts";
import { type Finding, locate, nodeError } from "../../shared/diagnostics.ts";
import { childrenOf, isAncestor } from "../../shared/node-path.ts";
import type { Ids } from "./ids.ts";

/** Where a node is listed: the file of the list, and how a message names that list. */
interface Place {
  readonly file: string;
  readonly line?: number;
  readonly name: string;
}

/**
 * The graph rules, from the loaded world alone (SpecCheck R1–R5, R9, R11): ids, orphans, scope, names, the rules tsc
 * leaves to check, built nodes with code. Pure: reads nothing but the world; every violation is one finding.
 */
export function checkDataRules(
  world: LoadedWorld,
  ids: Ids,
  typeErrorFiles: ReadonlySet<string> = new Set(),
): Finding[] {
  const typeErrors = typeErrorFiles.size > 0;
  // SpecCheck R1 first: every other rule skips the nodes whose id is duplicated.
  const judged = world.nodes.filter((node) => !ids.duplicated.has(node.spec.id));
  return [
    // DataRules R4 re-checks what tsc checks of defineWorld's name: after a type error in the world file it would
    // only repeat tsc; a name tsc cannot judge (a const typed string) still gets it after one elsewhere.
    ...(typeErrorFiles.has(world.definedIn) ? [] : worldName(world)),
    ...duplicateIds(world),
    ...repeatedListings(world, ids),
    ...orphans(world),
    ...judged.flatMap((node) => scope(world, ids, node)),
    ...siblingNames(world, ids),
    // SpecCheck R5 re-checks tsc's rules for what tsc could not decide; after a type error it would only repeat tsc.
    ...(typeErrors ? [] : judged.flatMap((node) => formatRules(world, node))),
    ...judged.flatMap((node) => builtWithoutSource(node)),
    ...judged.flatMap((node) => contracts(world, ids, node, typeErrors)),
  ];
}

/** DataRules R4: a missing, non-string or blank world name is an error at the world, never a crash. */
function worldName(world: LoadedWorld): Finding[] {
  if (typeof world.name === "string" && world.name.trim() !== "") return [];
  return [
    {
      severity: "error",
      ...locate({ file: world.definedIn, line: world.line }),
      rule: typeof world.name === "string" ? "the world's name is blank" : "the world has no name",
      fix: 'give defineWorld a name, e.g. name: "Shop"',
    },
  ];
}

/** SpecCheck R1: one error per node that repeats an id already held by the world or an earlier node, naming the first holder. */
function duplicateIds(world: LoadedWorld): Finding[] {
  const first = new Map<string, string>([[world.id, `the world (${world.definedIn})`]]);
  const findings: Finding[] = [];
  for (const node of world.nodes) {
    const holder = first.get(node.spec.id);
    if (holder === undefined) {
      first.set(node.spec.id, `${node.path} (${node.file})`);
      continue;
    }
    findings.push(
      nodeError(node, `id "${node.spec.id}" is already the id of ${holder}`, "give one of them a fresh, unique id"),
    );
  }
  return findings;
}

/**
 * SpecCheck R1: a node listed in two places is one error at the repeated listing, naming both places by the list and
 * where in its file each listing is.
 */
function repeatedListings(world: LoadedWorld, ids: Ids): Finding[] {
  /** The list a listing is in, at the listing itself when the loader knows where it was written. */
  const place = (listing: Listing): Place => {
    const { parent } = listing;
    const dome =
      parent === null ? undefined : (ids.byId(parent) ?? world.nodes.find((node) => node.spec.id === parent));
    const list =
      parent === null ? "the world's children" : dome ? `${dome.path}'s children` : `the children of ${parent}`;
    const owner = locate(parent === null ? { file: world.definedIn, line: world.line } : (dome ?? listing));
    const where = listing.line === undefined ? owner : locate(listing);
    const shown = where.line === undefined ? where.file : `${where.file}:${where.line}`;
    return { ...where, name: `${list} (${shown})` };
  };
  const seen = new Map<string, Place>();
  const findings: Finding[] = [];
  for (const listing of world.listings) {
    // Distinct nodes sharing an id are SpecCheck R1's other half: each node is listed once, only a repeat is the same node.
    if (ids.duplicated.has(listing.node)) continue;
    const here = place(listing);
    const before = seen.get(listing.node);
    if (!before) {
      seen.set(listing.node, here);
      continue;
    }
    const node = ids.byId(listing.node);
    findings.push({
      severity: "error",
      ...locate(here),
      ...(node ? { node: node.path } : {}),
      // The node part names a known node; an unknown one is named by its id in the rule.
      rule: `${node ? "" : `${listing.node} is `}listed twice: in ${before.name} and in ${here.name}`,
      fix: "keep one of the two listings",
    });
  }
  return findings;
}

/** SpecCheck R2: an exported node the world never reaches is a warning naming its file, and nothing else is judged of it. */
function orphans(world: LoadedWorld): Finding[] {
  return world.orphans.map((orphan) => ({
    severity: "warning",
    ...locate(orphan),
    node: orphan.name,
    rule: "exported but not reachable from the world",
    fix: `list it in a dome's children or in the world's (${world.definedIn}), or delete it`,
  }));
}

/** An unreachable node's name: its export name when it is an orphan, else its id. */
function orphanName(world: LoadedWorld, id: string): string {
  return world.orphans.find((orphan) => orphan.id === id)?.name ?? id;
}

/** How a message names a uses edge: `Orders uses Stock.reserve, Stock.release`. */
function usesEdge(node: LoadedNode, target: string, ports: readonly string[]): string {
  return `${node.spec.name} uses ${ports.map((port) => `${target}.${port}`).join(", ")}`;
}

/** SpecCheck R3: a uses edge targets a sibling or an ancestor's sibling, top level included; never a node inside one. */
function scope(world: LoadedWorld, ids: Ids, node: LoadedNode): Finding[] {
  const findings: Finding[] = [];
  const error = (rule: string, fix: string) => findings.push(nodeError(node, rule, fix));
  for (const edge of node.spec.edges ?? []) {
    if (edge.kind !== "uses" || ids.duplicated.has(edge.to)) continue;
    const target = ids.byId(edge.to);
    if (!target) {
      const name = orphanName(world, edge.to);
      error(
        `${usesEdge(node, name, edge.port)}, but ${name} is not reachable from the world`,
        `list ${name} in the world or in a dome in scope, or drop the edge`,
      );
      continue;
    }
    if (inScope(world, node, target)) continue;
    const edgeName = usesEdge(node, target.spec.name, edge.port);
    if (target === node || isAncestor(world, target, node)) {
      error(
        `${edgeName}, ${target === node ? "its own port" : "a port of its own ancestor"}; a node uses only its siblings and its ancestors' siblings`,
        "use the port of a sibling instead, or drop the edge",
      );
      continue;
    }
    const parent = target.parent === null ? undefined : world.nodes[target.parent];
    error(
      `${edgeName}, but ${target.path} is inside ${parent?.path ?? "another node"}; a node uses only its siblings and its ancestors' siblings`,
      `expose the port through ${parent?.spec.name ?? "its parent"}'s ports and use that, or move ${node.spec.name} into ${parent?.spec.name ?? "that dome"}`,
    );
  }
  return findings;
}

/** Whether `target` is a sibling of `node` or of one of its ancestors, never the node or an ancestor itself. */
function inScope(world: LoadedWorld, node: LoadedNode, target: LoadedNode): boolean {
  for (let at: LoadedNode | undefined = node; at; at = at.parent === null ? undefined : world.nodes[at.parent]) {
    if (at === target) return false;
    if (target.parent === at.parent) return true;
  }
  return false;
}

/** SpecCheck R4: names are unique among siblings, the top level included; a clash names both files. */
function siblingNames(world: LoadedWorld, ids: Ids): Finding[] {
  const findings: Finding[] = [];
  const parents = [null, ...world.nodes.map((node) => node.index)];
  for (const parent of parents) {
    const named = new Map<string, LoadedNode>();
    for (const child of childrenOf(world, parent)) {
      if (ids.duplicated.has(child.spec.id)) continue;
      const first = named.get(child.spec.name);
      if (!first) {
        named.set(child.spec.name, child);
        continue;
      }
      findings.push(
        nodeError(
          child,
          `${child.path} is the name of two siblings, in ${first.file} and ${child.file}`,
          "rename one of the two exports, or move one node into another dome",
        ),
      );
    }
  }
  return findings;
}

/** SpecCheck R5: the node-spec rules tsc only checks on literal ids and flags, held against the loaded values. */
function formatRules(world: LoadedWorld, node: LoadedNode): Finding[] {
  const spec = node.spec;
  const findings: Finding[] = [];
  const error = (rule: string, fix: string) => findings.push(nodeError(node, rule, fix));
  const isDome = childrenOf(world, node.index).length > 0;
  const usesSomething =
    (spec.edges ?? []).some((edge) => edge.kind === "uses") ||
    world.placeholders.some((placeholder) => placeholder.users.includes(spec.id));
  const implementsSomething = (spec.edges ?? []).some((edge) => edge.kind === "implements");
  if (spec.abstract && usesSomething)
    error("an abstract node has uses edges", "drop its uses, or make it not abstract");
  if (spec.abstract && implementsSomething) {
    error("an abstract node implements a contract", "drop its implements, or make it not abstract");
  }
  if (spec.abstract && isDome) error("an abstract node has children", "move its children out, or make it not abstract");
  if (spec.external && isDome) error("an external node has children", "move its children out, or make it not external");
  if (spec.external && node.parent !== null) {
    error("an external node is not at the top level", "list it in the world's children, or make it not external");
  }
  if (spec.externalType !== undefined && !spec.external) {
    error("externalType is set on a node that is not external", "drop externalType, or make the node external");
  }
  if (isDome && !spec.abstract && usesSomething) {
    error("a dome has uses edges; its behavior is its children", "move the uses to the child that needs them");
  }
  // LoadWorld made requirements and test cases lists of objects (R16).
  const ids = (spec.requirements ?? []).map((requirement) => requirement.id);
  for (const [index, id] of ids.entries()) {
    if (ids.indexOf(id) !== index) {
      error(`requirement id "${String(id)}" is used twice`, "give each requirement its own id");
    }
  }
  // Test cases are numbered as written, and judged against every requirement: after LoadWorld dropped an item of
  // either list, its problem comes first, so neither is judged here.
  const reshaped = node.reshaped ?? [];
  const judgeTests = !reshaped.includes("testCases") && !reshaped.includes("requirements");
  for (const [index, testCase] of judgeTests ? (spec.testCases ?? []).entries() : []) {
    const demonstrates: unknown = testCase.demonstrates ?? [];
    if (!Array.isArray(demonstrates)) {
      error(`test case ${index}'s demonstrates is not a list`, "make it a list of requirement ids, or drop it");
      continue;
    }
    for (const id of demonstrates) {
      if (!ids.includes(id)) {
        error(
          `test case ${index} demonstrates "${String(id)}", which is not one of its requirement ids`,
          `name one of ${ids.length ? ids.map((known) => `"${String(known)}"`).join(", ") : "its requirements (it has none)"}, or drop "${String(id)}"`,
        );
      }
    }
  }
  return findings;
}

/**
 * SpecCheck R11: every implements target is reachable. SpecCheck R5, unless TypeCheck found an error: implements lists
 * each contract once, each is abstract; no own port shares an inherited port's name, no two contracts a port name.
 */
function contracts(world: LoadedWorld, ids: Ids, node: LoadedNode, typeErrors: boolean): Finding[] {
  const findings: Finding[] = [];
  const error = (rule: string, fix: string) => findings.push(nodeError(node, rule, fix));
  const targets = (node.spec.edges ?? []).filter((edge) => edge.kind === "implements").map((edge) => edge.to);
  const inherited = new Map<string, string>();
  for (const [index, to] of targets.entries()) {
    if (ids.duplicated.has(to)) continue;
    const contract = ids.byId(to);
    const name = contract?.spec.name ?? orphanName(world, to);
    if (targets.indexOf(to) !== index) {
      if (!typeErrors) error(`${node.spec.name} implements ${name} twice`, `list ${name} once in implements`);
      continue;
    }
    // SpecCheck R11: the target is a reachable contract.
    if (!contract) {
      error(
        `${node.spec.name} implements ${name}, which is not reachable from the world`,
        `list ${name} in the world or a dome, or drop it from implements`,
      );
      continue;
    }
    // From here on SpecCheck R5: tsc's contract rules, held against the loaded values.
    if (typeErrors) continue;
    if (!contract.spec.abstract) {
      error(
        `${node.spec.name} implements ${contract.path}, which is not abstract`,
        `make ${contract.spec.name} abstract, implement an abstract node instead, or drop it from implements`,
      );
      continue;
    }
    for (const port of portNames(contract.spec)) {
      const other = inherited.get(port);
      if (other !== undefined) {
        error(
          `${other} and ${contract.spec.name} both declare a port named ${port}`,
          `rename the port in one contract, or implement only one of them`,
        );
      } else inherited.set(port, contract.spec.name);
    }
  }
  for (const port of typeErrors ? [] : portNames(node.spec)) {
    const contract = inherited.get(port);
    if (contract !== undefined) {
      error(`own port ${port} has the name of a port inherited from ${contract}`, `rename the own port ${port}`);
    }
  }
  return findings;
}

function portNames(spec: NodeSpec): string[] {
  return (spec.ports ?? []).map((port) => port.name);
}

/** SpecCheck R9: a building or built node, not external or abstract, lists at least one source entry. */
function builtWithoutSource(node: LoadedNode): Finding[] {
  const spec = node.spec;
  if (spec.external || spec.abstract || (spec.status !== "building" && spec.status !== "built")) return [];
  // A source LoadWorld replaced has its problem already: an empty list there is no second break (R16).
  if (spec.source.length > 0 || node.reshaped?.includes("source")) return [];
  return [
    nodeError(
      node,
      `a ${spec.status} node lists no source`,
      'list its code in source, e.g. ["src/orders/**"], or set its status to "planned"',
    ),
  ];
}
