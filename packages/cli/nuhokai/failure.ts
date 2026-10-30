import { node } from "@nuhokai/world";

/** The failure surface: an expectable failure, and the rule that makes it one line. */
export const Failure = node({
  id: "01a17950-b221-7126-bd52-7e93a4c10f38",
  purpose:
    "The CLI's failure surface: one error type for expected failures, the expected-vs-bug test, and flattening any " +
    "thrown value to one stderr line. Classifies and formats only.",
  status: "built",
  source: ["src/shared/failure.ts"],
  ports: {
    format: {
      kind: "call",
      purpose: "Flatten a thrown value to one stderr line",
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
      id: "C1",
      kind: "constraint",
      text: "No printing, command prefix, exit code or message vocabulary; commands own their line.",
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
  ],
  decisions: [
    {
      decision:
        "One shared error type, classifier and formatter; each command keeps its own prefix, wording and exit code.",
      why: "LoadWorld throws while Init, New and map print, so the type must be shared for the expected-failure test to work across nodes; wording stays with the command that knows the context.",
      rejected: [
        {
          option: "Private error class and formatter per command",
          why: "Three copies of one rule drift; stderr stops being one line per failure.",
        },
      ],
    },
    {
      decision: "A filesystem failure (thrown Error with numeric errno) is expected, decided here once.",
      why: "I/O fails operationally (permissions, disk full, a path in the way) inside shared nodes whose contracts list no errors; Init and New need the same test to keep it off the crash path.",
      rejected: [
        {
          option: "Only CliError counts; each leaf wraps its own filesystem errors",
          why: "Inspect would start naming failures instead of deciding nothing; wrapping drifts per leaf.",
        },
        {
          option: "Private classifier per command",
          why: "Copies drift; stderr stops being one line per failure.",
        },
      ],
    },
  ],
}).edges({});
