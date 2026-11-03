import { node } from "@nuhokai/world";
import { Check } from "./check/check.ts";
import { FileSystem, Terminal } from "./external.ts";
import { Failure } from "./failure.ts";
import { Init } from "./init/init.ts";
import { WorldMap } from "./map/world-map.ts";
import { Tree } from "./tree/tree.ts";

/** The command surface: argv, usage, exit codes and dispatch to the command nodes. */
export const Cli = node({
  id: "01a16dd6-9f2a-7c3e-8a41-2b7d4e6f9c10",
  purpose:
    "Command surface: parse argv, print usage, dispatch to per-command Cmds listed in main (help text, declared " +
    "positionals, options each with the parse of its value, and a run holding the deferred call into the command " +
    "node), print their reports; owns exit codes and is the only node that touches the terminal. Implements no " +
    "command; Build makes and ships it.",
  status: "building",
  source: [
    "src/bin.ts",
    "src/bin.test.ts",
    "src/only-cli-prints.test.ts",
    "src/cli/cmd.ts",
    "src/cli/commands/check.ts",
    "src/cli/commands/init.ts",
    "src/cli/commands/map.ts",
    "src/cli/commands/tree.ts",
    "src/cli/commands/tree.test.ts",
    "src/cli/commands/update.ts",
  ],
  ports: {
    dispatch: {
      kind: "call",
      purpose:
        "Parse argv: split --path and the command's options off, answer help, count the positionals against the command's Cmd, judge each value by its option's parse; run the Cmd with the directory and the typed arguments, print its report",
      input: "argv without the executable",
      output:
        "exit code: 0 ok, 1 errors or failure, 2 usage or argument error; stdout: result lines; stderr: 'nuhokai <command>: ' failure lines and usage errors",
      errors: ["unknown command"],
    },
  },
  requirements: [
    { id: "R1", text: "A repo needs no TypeScript, Bun or node_modules; the CLI ships its own pinned checker." },
    {
      id: "R2",
      text: "A command's outcome becomes the exit code: ok 0, failed 1 (failure or errors), invalid 2 (an invalid argument value), as Cli's own usage errors are 2.",
    },
    {
      id: "R3",
      text: "No argument, help, --help or -h → usage, exit 0. Usage lists every command with its argument form and a one-line description; `nuhokai <command> --help` (or -h) repeats that form, exit 0; after a command `help` is an ordinary argument. Unknown command → usage on stderr, exit 2.",
    },
    {
      id: "R4",
      text: "No loading, rule, tsc or writing logic in Cli: each command is its own node. Each command's Cmd imports its node only inside its run, called only when the command runs, so usage and help load none: bin.ts statically reaches only Cli's own files, Report and Failure.",
    },
    {
      id: "R5",
      text: "World imports type-check only as relative files and @nuhokai/world; the CLI runs no world file and installs nothing.",
    },
    {
      id: "R6",
      text: "Cli enforces argument counts: init, check, update, map none; tree at most one. Cli splits --path and the command's own options off and answers help; a help flag beside other arguments → 'unexpected argument', any other dash argument than --path, --help, -h and tree's R8 options → 'unknown option'; then Cli counts the positionals against the Cmd's declared ones: too many → argument error (2) naming the first extra ('unexpected argument 'x''), before any value is judged. Each exits 2 and the command never runs. Arguments pass through unchanged, never validated.",
    },
    {
      id: "R7",
      text: "Every command works in one project directory: --path <dir> (or --path=<dir>) against the cwd, else the cwd. Missing value, second --path or a path that is no directory → usage error (2), command never runs. The command gets the directory, never the cwd, and prints its paths cwd-relative.",
    },
    {
      id: "R8",
      text: "tree takes --level <n> (--level=<n>, -L <n>): a whole number, 0 = unlimited, default 1. Missing value or a second --level or -L → usage error (2) naming the spelling typed; no whole number (x, -1, 1.5) → usage error (2), judged after help as a bad --path is; the command never runs. Cli splits it off as it does --path and judges the value by the option's parse; tree's run hands Tree.run the directory, the hierarchy path or none, and the level as a number; `nuhokai tree --help` lists --level.",
    },
    {
      id: "R9",
      text: "Cli is the only node that prints: a command returns a Report (outcome and ordered lines) and never touches the terminal. Cli writes its result lines to stdout and its failure lines to stderr after 'nuhokai <command>: ', in the Report's order, each run of control characters as one space (Terminal R1), as in what its usage errors echo of what was typed, then maps the outcome to the exit code (R2). A bug cutting a command short (a CutShort, Failure R5), whether its run throws at once or rejects, still crashes with its stack, after Cli prints the lines the command answered before it.",
    },
    { id: "C1", kind: "constraint", text: "No bundled language server; editors use their own." },
    { id: "C3", kind: "constraint", text: "macOS/Linux, arm64/x86_64." },
  ],
  testCases: [
    {
      text: "Usage lists every command with its argument form (`nuhokai tree [node] [-L <n>]` visible); --help, `nuhokai init --help`, `nuhokai tree --help` exit 0.",
      demonstrates: ["R3"],
    },
    {
      text: "Unknown command → usage on stderr, exit 2; a command's failed outcome exits 1, its invalid outcome 2.",
      demonstrates: ["R2", "R3"],
    },
    {
      text: "Empty node_modules: the checker reports only authored violations and rejects a non-relative import.",
      demonstrates: ["R1", "R5"],
    },
    {
      text: "`nuhokai map` runs WorldMap with the cwd; `nuhokai map x` → argument error, WorldMap never runs.",
      demonstrates: ["R6"],
    },
    {
      text: "From a parent directory: `init --path packages/app` writes packages/app/nuhokai/, `map --path=packages/app` maps it; --path without value, twice or naming no directory (missing path, file, file/x) → exit 2, nothing runs; `map --path x --help` prints map's help.",
      demonstrates: ["R7"],
    },
    {
      text: "`nuhokai help` prints usage; `nuhokai tree help` reaches Tree with the node help; `nuhokai map help` → unexpected argument 'help', exit 2.",
      demonstrates: ["R3", "R6"],
    },
    {
      text: "`map --pth out`, `init --force` → unknown option '--pth' / '--force' with usage, exit 2; `tree a b c` → unexpected argument 'b'; nothing runs.",
      demonstrates: ["R6"],
    },
    {
      text: "--level's parse alone: 0, 2, 10 → the number; x, -1, 1.5 → none. tree's run alone, given the positionals and the level: none → Tree with (no node, 1); -L 2, Check with --level 0, help → (none, 2), (Check, 0), (help, 1). Through Cli: -L x, -1, --level 1.5 → the usage error naming the spelling; `a b c`, and `a b` beside -L x → unexpected argument 'b'.",
      demonstrates: ["R6", "R8"],
    },
    {
      text: "`tree`, `tree Check -L 2`, `tree --level=0 Check` reach Tree with (directory, node or none, 1 | 2 | 0); `tree -L`, `tree -L x`, `tree -L 1 --level 2`, `tree --depth 2`, `map -L 1` → exit 2, nothing runs.",
      demonstrates: ["R6", "R8"],
    },
    {
      text: "Errors in order: `tree a b -L` → -L needs a whole number; `tree a b --bad -L x` → unknown option '--bad'; `tree x --help` → unexpected argument '--help'; `tree a b -L x` → unexpected argument 'b'; `tree --path nope -L x` → got 'x'; `map --path nope x` → unexpected argument 'x'.",
      demonstrates: ["R6", "R7", "R8"],
    },
    {
      text: "A Report of result a, failure x, result b → stdout a, b; stderr 'nuhokai tree: x'. No script under src but bin.ts and tests, read as a syntax tree, names console, process beyond its machine facts, Bun's std streams, a terminal module, descriptor 0–2 or a terminal device; in the CLI's own world only Cli uses Terminal.",
      demonstrates: ["R2", "R9"],
    },
    {
      text: "A result line holding ESC and a failure line holding a bare carriage return → each printed with a space instead; `nuhokai update` → 'nuhokai update: not implemented yet', exit 1; SpecCheck throwing a TypeError on a world with a tsc error → the tsc line on stdout, then the TypeError thrown; a run throwing a CutShort at once → its lines printed, then its bug thrown.",
      demonstrates: ["R2", "R9"],
    },
    {
      text: "An unknown command, an unknown option, a -L value, an extra argument and a --path holding ESC, a newline or a bell → the usage error echoes each run as one space.",
      demonstrates: ["R9"],
    },
    {
      text: "Following bin.ts's static imports through the syntax tree (not `import type`, not import()) reaches only src/cli, Report, Failure and node: modules; a static import of a command node in a Cmd fails it.",
      demonstrates: ["R4"],
    },
  ],
  decisions: [
    {
      decision:
        "TypeScript on Bun, shipped as a per-platform binary embedding Bun and the @nuhokai/world declarations, with the pinned checker beside it.",
      why: "The checker reads and type-checks worlds the way the editor does; embedding keeps the repo toolchain-free.",
      rejected: [
        {
          option: "A parser of our own",
          why: "Would re-implement the checker's import, re-export and alias resolution.",
        },
        { option: "repo Bun, Node or tsc", why: "Forces a toolchain install; version-dependent results." },
      ],
    },
    {
      decision: "Cli is a dispatcher; each command is a top-level node with its own port, reached by `uses`.",
      why: "Commands are separate domes with separate rules; the dispatcher stays small and stable.",
      rejected: [
        {
          option: "command ports on Cli",
          why: "Delegation points down only; duplicating each contract on the dispatcher drifts from the nodes.",
        },
      ],
    },
    {
      decision:
        "Commands return a Report: an outcome (ok, failed, invalid) and the lines to print; Cli prints them and owns the exit codes.",
      why: "One node talks to the terminal, so the prefix, the stream per line and the exit code are decided once; commands become plain functions their tests read without capturing output.",
      rejected: [
        {
          option: "Each command prints through an injected out/err and resolves to its exit code",
          why: "Every command repeats the prefix and the exit-code table, and the map shows five nodes using Terminal.",
        },
        {
          option: "Commands return exit codes",
          why: "A number is the process's vocabulary; 'invalid' says what happened, Cli says what it means to a shell.",
        },
      ],
    },
    {
      decision: "Exit 2: wrong command, flag or argument count, or a command's invalid argument value.",
      why: "One code for 'invocation wrong' keeps scripts to two branches: Cli owns the call's shape, the command its values.",
      rejected: [
        {
          option: "A fourth code for invalid values",
          why: "More states than scripts use; the stderr line already says which.",
        },
      ],
    },
    {
      decision:
        "Cli parses every option, a command's own too (tree's --level: split off by Cli, its value judged by the option's parse), and hands run typed values.",
      why: "One parser and one help text; commands stay flag-free, as with --path. The value's meaning (which node) stays the command's.",
      rejected: [
        {
          option: "Tree parses its own argv",
          why: "Two parsers drift on --opt=value, repeats, help and error wording.",
        },
      ],
    },
    {
      decision:
        "Inside Cli each command is a Cmd in its own file under src/cli/commands (description, positionals, options each with its parse, run), and main lists them in a const object at its top, the one place to see which commands exist. bin.ts splits --path and the command's options off once, answers help and stray dash arguments, counts the positionals, judges each value by its option's parse, and derives the synopsis 'nuhokai <name> <positionals> [<option> <value>]…' from positionals and options; run(root, args) holds the deferred import and reads typed values by option.",
      why: "Adding a command touches one file instead of five parallel tables; Cli does the generic counting and judging once, so a command declares data and states only its call; the deferred import sits in run, which only a running command calls, so help never loads a command node; the generic lives on Option, so the registry stays plain Cmds.",
      rejected: [
        {
          option: "Each command node exports its own Cmd",
          why: "argv is the delivery layer's concern; it would reverse 'commands stay flag-free, Cli owns every option' and make the deferred imports fragile.",
        },
        {
          option: "A register() registry or factory functions",
          why: "The commands are fixed at compile time; a const object says the same with nothing to run.",
        },
        {
          option: "A generic Cmd<A> whose parse returns A and exec(root, A) takes it",
          why: "A registry of Cmd<unknown> accepts any exec and, by method bivariance, a parse and exec that disagree; it needs a helper to tie them and a guard to tell an error from A.",
        },
        {
          option: "parse returning a runner closure",
          why: "Repeats the count and the import wrapper in every command.",
        },
        {
          option: "A module-level COMMANDS const",
          why: "Reading main means jumping to it and back; inside main the list sits where dispatch starts, and usage and help take it as an argument.",
        },
      ],
    },
    {
      decision: "Imports: relative files and @nuhokai/world only; CLI owns the tsconfig.",
      why: "Embedded .d.ts and paths suffice; independent of the repo's dependency graph.",
      rejected: [
        { option: "arbitrary packages", why: "Checker needs repo resolution and TypeScript." },
        { option: "repo tsconfig", why: "Could weaken strict mode or resolution." },
      ],
    },
    {
      decision: "One folder nuhokai/ (layout: Path/WorldPath), same for users and this package.",
      why: "Users see it after init, so the CLI uses it too; .generated keeps authored and generated files in one folder.",
      rejected: [{ option: "world/ or spec/", why: "Generic or collision-prone names for executed files." }],
    },
    {
      decision: "Project directory = the cwd or --path; nothing else.",
      why: "One rule, no guessing or interaction; any folder holding nuhokai/ is one, also a package in a monorepo.",
      rejected: [
        {
          option: "The Git root, else the cwd after a yes/no prompt",
          why: "Cannot reach a world below the root; needs git and a terminal.",
        },
      ],
    },
  ],
}).edges({
  uses: () => [
    Init.run,
    WorldMap.run,
    Check.run,
    Tree.run,
    Failure.report,
    Terminal.print,
    Terminal.printError,
    FileSystem.read,
  ],
});
