import { node } from "@nuhokai/world";

/** The failure surface: an expectable failure, and the rule that makes it one line. */
export const Failure = node({
  id: "01a17950-b221-7126-bd52-7e93a4c10f38",
  purpose:
    "The CLI's failure surface: one error type for expected failures, the expected-vs-bug test, flattening any " +
    "thrown value to one line, and the Report every command returns: its outcome and its result and failure " +
    "lines, and the helpers that build it. Classifies, formats and shapes only; never prints.",
  status: "built",
  source: [
    "src/shared/failure.ts",
    "src/shared/failure.test.ts",
    "src/shared/report.ts",
    "src/shared/report.test.ts",
    "src/shared/split-report.ts",
  ],
  ports: {
    format: {
      kind: "call",
      purpose: "Flatten a thrown value to one failure line",
      input: "any thrown value",
      output: "one non-empty line, no newlines",
      errors: [],
    },
    isExpected: {
      kind: "call",
      purpose: "Whether a command expects to explain a thrown value",
      input: "any thrown value",
      output: "true for a CliError or filesystem failure (Error with numeric errno), else false",
      errors: [],
    },
    report: {
      kind: "call",
      purpose:
        "Build a command's Report: a result or failure line, ok from result texts, failed from a thrown value; run a command that adds its lines as it goes",
      input: "result texts, a failure text or a thrown value; a command adding its lines as it goes",
      output:
        "a Report or one of its lines; a bug is rethrown, and one escaping a command adding its lines is a CutShort carrying them",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Expected failure: CliError or filesystem failure (thrown Error with numeric errno). Anything else is a bug: rethrown, not formatted.",
    },
    {
      id: "R2",
      text: "Line = the error's message, else String(value); each whitespace run around a newline → one space; trimmed.",
    },
    { id: "R3", text: "Never empty: missing or blank message → 'unknown error'." },
    {
      id: "R4",
      text: "A Report is plain data: an outcome (ok, failed or invalid) and its lines in print order, each a result or a failure line; a failure line carries no 'nuhokai <command>: ' prefix.",
    },
    {
      id: "R5",
      text: "From a thrown value, report makes one failure line (format) only when it is expected (isExpected); a bug is rethrown. A bug escaping a command that adds its lines as it goes becomes a CutShort carrying those lines and the bug, so Cli prints what the command found before it crashes.",
    },
    {
      id: "C1",
      kind: "constraint",
      text: "No printing, command prefix, exit code or message vocabulary; commands own their line, Cli its prefix and exit code.",
    },
  ],
  testCases: [
    {
      text: "Multi-line Error message → one space-separated line; thrown string or plain object → its string form.",
      demonstrates: ["R2"],
    },
    {
      text: "Empty message, blank message, thrown empty string → 'unknown error'; CliError is a type distinct from Error.",
      demonstrates: ["R1", "R3"],
    },
    {
      text: "CliError, filesystem Error with errno: expected. TypeError, thrown string, plain object with errno, null: bugs.",
      demonstrates: ["R1"],
    },
    {
      text: "ok of two texts → two result lines; failedFrom a CliError → its one failure line, failed; failedFrom a TypeError → the TypeError rethrown; a collecting command that adds a line, then throws → a CutShort with that line and the bug.",
      demonstrates: ["R4", "R5"],
    },
  ],
  decisions: [
    {
      decision:
        "One shared error type, classifier and formatter; each command keeps its own wording and outcome, Cli the prefix and exit code.",
      why: "LoadWorld throws while Init, WorldMap, Check and Tree report, so the type must be shared for the expected-failure test to work across nodes; wording stays with the command that knows the context.",
      rejected: [
        {
          option: "Private error class and formatter per command",
          why: "One copy of the rule per command drifts; a failure stops being one line.",
        },
      ],
    },
    {
      decision: "A filesystem failure (thrown Error with numeric errno) is expected, decided here once.",
      why: "I/O fails operationally (permissions, disk full, a path in the way) inside shared nodes whose contracts list no errors; every command needs the same test to keep it off the crash path.",
      rejected: [
        {
          option: "Only CliError counts; each leaf wraps its own filesystem errors",
          why: "Inspect would start naming failures instead of deciding nothing; wrapping drifts per leaf.",
        },
        {
          option: "Private classifier per command",
          why: "Copies drift; a failure stops being one line.",
        },
      ],
    },
    {
      decision:
        "The Report type (outcome ok, failed or invalid; result and failure lines in order) lives here, beside the one-line rule.",
      why: "Every command returns it and its failure lines are this node's lines; a node of its own would hold one type.",
      rejected: [
        {
          option: "Report owned by Cli",
          why: "Commands would import from the dispatcher that imports them; delegation points down only.",
        },
      ],
    },
  ],
}).edges({});
