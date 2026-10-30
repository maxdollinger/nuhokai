import type { NodeSpec } from "@nuhokai/world/node-spec";
import type { LoadedWorld } from "../../load/load-world.ts";
import type { Finding } from "../diagnostics.ts";
import { at, type TreeNode, type WorldTree, worldTree } from "./world-tree.ts";

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
export function checkData(world: LoadedWorld): Finding[] {
  const tree = worldTree(world);
  // R1 first: every other rule skips the nodes whose id is duplicated.
  const judged = tree.nodes.filter((node) => !tree.duplicated.has(node.spec.id));
  return [
    ...worldName(world),
    ...duplicateIds(world, tree),
    ...repeatedListings(world, tree),
    ...orphans(world),
    ...judged.flatMap((node) => scope(world, tree, node)),
    ...siblingNames(tree),
    ...judged.flatMap((node) => [...formatRules(world, tree, node), ...builtWithoutSource(node)]),
    ...judged.flatMap((node) => contracts(world, tree, node)),
  ];
}

/** DataRules R4: a missing, non-string or blank world name is an error at the world, never a crash. */
function worldName(world: LoadedWorld): Finding[] {
  if (typeof world.name === "string" && world.name.trim() !== "") return [];
  return [
    {
      severity: "error",
      file: world.file,
      rule: typeof world.name === "string" ? "the world's name is blank" : "the world has no name",
      fix: 'give defineWorld a name, e.g. name: "Shop"',
    },
  ];
}

/** R1: one error per node that repeats an id already held by the world or an earlier node, naming the first holder. */
function duplicateIds(world: LoadedWorld, tree: WorldTree): Finding[] {
  const first = new Map<string, string>([[world.id, `the world (${world.file})`]]);
  const findings: Finding[] = [];
  for (const node of tree.nodes) {
    const holder = first.get(node.spec.id);
    if (holder === undefined) {
      first.set(node.spec.id, `${node.path} (${node.file})`);
      continue;
    }
    findings.push({
      severity: "error",
      ...at(node),
      node: node.path,
      rule: `id "${node.spec.id}" is already the id of ${holder}`,
      fix: "give one of them a fresh, unique id",
    });
  }
  return findings;
}

/** R1: a node listed in two places is one error at the repeated listing, naming both places. */
function repeatedListings(world: LoadedWorld, tree: WorldTree): Finding[] {
  const place = (parent: string | null): Place => {
    if (parent === null) return { file: world.file, name: `the world's children (${world.file})` };
    const dome = tree.byId(parent) ?? tree.nodes.find((node) => node.spec.id === parent);
    if (!dome) return { file: world.file, name: `the children of ${parent}` };
    return { ...at(dome), name: `${dome.path}'s children (${dome.file})` };
  };
  const seen = new Map<string, Place>();
  const findings: Finding[] = [];
  for (const listing of world.listings) {
    // Distinct nodes sharing an id are R1's other half: each node is listed once, only a repeat is the same node.
    if (tree.duplicated.has(listing.node)) continue;
    const here = place(listing.parent);
    const before = seen.get(listing.node);
    if (!before) {
      seen.set(listing.node, here);
      continue;
    }
    const node = tree.byId(listing.node);
    findings.push({
      severity: "error",
      file: here.file,
      ...(here.line === undefined ? {} : { line: here.line }),
      ...(node ? { node: node.path } : {}),
      rule: `${node?.spec.name ?? listing.node} is listed twice: in ${before.name} and in ${here.name}`,
      fix: "keep one of the two listings",
    });
  }
  return findings;
}

/** R2: an exported node the world never reaches is a warning naming its file, and nothing else is judged of it. */
function orphans(world: LoadedWorld): Finding[] {
  return world.orphans.map((orphan) => ({
    severity: "warning",
    file: orphan.file,
    node: orphan.name,
    rule: `${orphan.name} is exported but not reachable from the world`,
    fix: `list it in a dome's children or in the world's (${world.file}), or delete it`,
  }));
}

/** An unreachable node's name: its export name when it is an orphan, else its id. */
function orphanName(world: LoadedWorld, id: string): string {
  return world.orphans.find((orphan) => orphan.id === id)?.name ?? id;
}

/** How a message names a uses edge: `Orders uses Stock.reserve, Stock.release`. */
function usesEdge(node: TreeNode, target: string, ports: readonly string[]): string {
  return `${node.spec.name} uses ${ports.map((port) => `${target}.${port}`).join(", ")}`;
}

/** R3: a uses edge targets a sibling or an ancestor's sibling, top level included; never a node inside one. */
function scope(world: LoadedWorld, tree: WorldTree, node: TreeNode): Finding[] {
  const findings: Finding[] = [];
  const error = (rule: string, fix: string) =>
    findings.push({ severity: "error", ...at(node), node: node.path, rule, fix });
  for (const edge of node.spec.edges ?? []) {
    if (edge.kind !== "uses" || tree.duplicated.has(edge.to)) continue;
    const target = tree.byId(edge.to);
    if (!target) {
      const name = orphanName(world, edge.to);
      error(
        `${usesEdge(node, name, edge.port)}, but ${name} is not reachable from the world`,
        `list ${name} in the world or in a dome in scope, or drop the edge`,
      );
      continue;
    }
    if (inScope(tree, node, target)) continue;
    const edgeName = usesEdge(node, target.spec.name, edge.port);
    if (target === node || tree.isAncestor(target, node)) {
      error(
        `${edgeName}, ${target === node ? "its own port" : "a port of its own ancestor"}; a node uses only its siblings and its ancestors' siblings`,
        "use the port of a sibling instead, or drop the edge",
      );
      continue;
    }
    const parent = target.parent === null ? undefined : tree.nodes[target.parent];
    error(
      `${edgeName}, but ${target.path} is inside ${parent?.path ?? "another node"}; a node uses only its siblings and its ancestors' siblings`,
      `expose the port through ${parent?.spec.name ?? "its parent"}'s ports and use that, or move ${node.spec.name} into ${parent?.spec.name ?? "that dome"}`,
    );
  }
  return findings;
}

/** Whether `target` is a sibling of `node` or of one of its ancestors, never the node or an ancestor itself. */
function inScope(tree: WorldTree, node: TreeNode, target: TreeNode): boolean {
  for (let at: TreeNode | undefined = node; at; at = at.parent === null ? undefined : tree.nodes[at.parent]) {
    if (at === target) return false;
    if (target.parent === at.parent) return true;
  }
  return false;
}

/** R4: names are unique among siblings, the top level included; a clash names both files. */
function siblingNames(tree: WorldTree): Finding[] {
  const findings: Finding[] = [];
  const parents = [null, ...tree.nodes.map((node) => node.index)];
  for (const parent of parents) {
    const named = new Map<string, TreeNode>();
    for (const child of tree.childrenOf(parent)) {
      if (tree.duplicated.has(child.spec.id)) continue;
      const first = named.get(child.spec.name);
      if (!first) {
        named.set(child.spec.name, child);
        continue;
      }
      findings.push({
        severity: "error",
        ...at(child),
        node: child.path,
        rule: `${child.path} is the name of two siblings, in ${first.file} and ${child.file}`,
        fix: "rename one of the two exports, or move one node into another dome",
      });
    }
  }
  return findings;
}

/** R5: the node-spec rules tsc only checks on literal ids and flags, held against the loaded values. */
function formatRules(world: LoadedWorld, tree: WorldTree, node: TreeNode): Finding[] {
  const spec = node.spec;
  const findings: Finding[] = [];
  const error = (rule: string, fix: string) =>
    findings.push({ severity: "error", ...at(node), node: node.path, rule, fix });
  const isDome = tree.childrenOf(node.index).length > 0;
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
  const ids = (spec.requirements ?? []).map((requirement) => requirement.id);
  for (const [index, id] of ids.entries()) {
    if (ids.indexOf(id) !== index) {
      error(`requirement id "${id}" is used twice`, "give each requirement its own id");
    }
  }
  for (const [index, testCase] of (spec.testCases ?? []).entries()) {
    for (const id of testCase.demonstrates ?? []) {
      if (!ids.includes(id)) {
        error(
          `test case ${index} demonstrates "${id}", which is not one of its requirement ids`,
          `name one of ${ids.length ? ids.map((known) => `"${known}"`).join(", ") : "its requirements (it has none)"}, or drop "${id}"`,
        );
      }
    }
  }
  return findings;
}

/** R5: implements lists each contract once; no own port shares an inherited port's name, no two contracts a port name. */
function contracts(world: LoadedWorld, tree: WorldTree, node: TreeNode): Finding[] {
  const findings: Finding[] = [];
  const error = (rule: string, fix: string) =>
    findings.push({ severity: "error", ...at(node), node: node.path, rule, fix });
  const targets = (node.spec.edges ?? []).filter((edge) => edge.kind === "implements").map((edge) => edge.to);
  const inherited = new Map<string, string>();
  for (const [index, to] of targets.entries()) {
    if (tree.duplicated.has(to)) continue;
    const contract = tree.byId(to);
    const name = contract?.spec.name ?? orphanName(world, to);
    if (targets.indexOf(to) !== index) {
      error(`${node.spec.name} implements ${name} twice`, `list ${name} once in implements`);
      continue;
    }
    // R11: the target is a reachable contract.
    if (!contract) {
      error(
        `${node.spec.name} implements ${name}, which is not reachable from the world`,
        `list ${name} in the world or a dome, or drop it from implements`,
      );
      continue;
    }
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
  for (const port of portNames(node.spec)) {
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

/** R9: a building or built node, not external or abstract, lists at least one source entry. */
function builtWithoutSource(node: TreeNode): Finding[] {
  const spec = node.spec;
  if (spec.external || spec.abstract || (spec.status !== "building" && spec.status !== "built")) return [];
  if (!Array.isArray(spec.source) || spec.source.length > 0) return [];
  return [
    {
      severity: "error",
      ...at(node),
      node: node.path,
      rule: `a ${spec.status} node lists no source`,
      fix: 'list its code in source, e.g. ["src/orders/**"], or set its status to "planned"',
    },
  ];
}
