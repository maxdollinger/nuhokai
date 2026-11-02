import { node } from "@nuhokai/world";

/** The one name of a node: its hierarchy path, and the way back from a typed path to the node. Pure. */
export const NodePath = node({
  id: "01a19cc8-5da4-7071-9b9b-71c1bcea0cbe",
  purpose:
    "Own the one name of a node, its hierarchy path (Check/SpecCheck), which commands print and take: name every " +
    "node of a loaded world, and find the node a typed path names. Pure: no I/O, never loads.",
  status: "built",
  source: ["src/shared/node-path.ts", "src/shared/node-path.test.ts"],
  ports: {
    nodePaths: {
      kind: "call",
      purpose: "Name every node of a loaded world",
      input: "the loaded world, as LoadWorld.load answers it",
      output: "each node's hierarchy path, in nodes order",
      errors: [],
    },
    findNode: {
      kind: "call",
      purpose: "Find the node a hierarchy path names",
      input:
        "the loaded world, a hierarchy path as typed, the project directory (cwd-relative) for the commands it names",
      output: "the node's position in nodes",
      errors: [
        "no node at that path: names the closest match or the command listing where it went wrong",
        "two siblings share a name on the path",
        "a name on the path holds /",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Path = the names from the top level down to the node, joined with /; a top-level node's path is its name alone. Names are LoadWorld's (export name, else id).",
    },
    {
      id: "R2",
      text: "Built from LoadWorld's parents by position, never by id, so duplicate ids cannot misplace a node.",
    },
    {
      id: "R3",
      text: "findNode: exact, case-sensitive, one segment at a time from the top level. One trailing / is accepted (a collapsed dome as Tree prints it); an empty path or an empty segment (//, a leading /) names no node; a node whose name holds / cannot be addressed, and saying so is the error.",
    },
    {
      id: "R4",
      text: "No node → one CliError naming the typed path and, at the first segment that matches nothing, the closest name among that parent's children: equal ignoring case, else the smallest edit distance up to a third of the segment's length, ties in walk order; the rest of the path corrected the same way as far as it goes: \"no node 'check/specchek'; did you mean 'Check/SpecCheck'?\". No close name → the command listing the deepest node found: \"no node 'Check/Rules'; `nuhokai tree Check` lists its children\". Paths are quoted; a command is in backticks, carries --path <dir> unless the project directory is the cwd, and quotes a word as a shell needs it, so it runs as printed.",
    },
    {
      id: "R5",
      text: "Two siblings with the segment's name → one CliError naming the path and that `nuhokai check` reports the clash. Paths of such siblings are equal; nodePaths still names both.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "No filesystem access, no load, no printing: the caller owns its prefix and exit code.",
    },
  ],
  testCases: [
    {
      text: "Example world: nodePaths → Postgres, AuditLog, Shop, Shop/Orders, Shop/Stock in nodes order; dome P (id x) with children C1 (id x) and C2 → C2 is P/C2.",
      demonstrates: ["R1", "R2"],
    },
    {
      text: "Example world: findNode Shop/Stock and Shop/Stock/ → Stock's position; shop/stock and Shop/Stok → did you mean 'Shop/Stock'; Shop/Basket → `nuhokai tree Shop` lists its children, under --path packages/cli `nuhokai tree Shop --path packages/cli`; '', /Shop, Shop//Stock → no node; a top-level node named Ex/ample → its name holds /.",
      demonstrates: ["R3", "R4"],
    },
    {
      text: "Two top-level nodes both named Orders (exported from two files) → findNode Orders fails naming `nuhokai check`; nodePaths lists Orders twice.",
      demonstrates: ["R5"],
    },
  ],
  decisions: [
    {
      decision: "Nodes are addressed by hierarchy path, the name check's diagnostics already print.",
      why: "Names are unique among siblings only, so a bare name can be ambiguous; ids are unreadable. A path reads as a location and survives grep.",
      rejected: [
        {
          option: "Bare export name",
          why: "Names repeat across domes (two Run nodes); world-wide uniqueness was never the rule.",
        },
        { option: "Node id", why: "Nobody types or recognises a uuid." },
      ],
    },
    {
      decision: "Case-sensitive match; a case slip only steers the suggestion.",
      why: "Export names are identifiers; Orders and orders may be siblings, and one exact answer keeps scripts predictable.",
      rejected: [{ option: "Case-insensitive match", why: "Ambiguous as soon as two siblings differ only in case." }],
    },
    {
      decision:
        "NodePath is shared, under Path; check's world tree (src/check/spec-check/world-tree.ts) takes its paths from here.",
      why: "tree prints paths, review (MAX-33) and future commands take them, check's diagnostics print them: one rule, or the spellings drift.",
      rejected: [
        {
          option: "A paths field on LoadWorld.load",
          why: "Naming every node fits, but finding a node from typed input with suggestions is not loading; LoadWorld judges nothing.",
        },
      ],
    },
  ],
}).edges({});
