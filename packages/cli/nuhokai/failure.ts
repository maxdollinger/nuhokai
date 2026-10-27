import { node } from "@nuhokai/world";

/** The failure surface: an expectable failure, and the rule that makes it one line. */
export const Failure = node({
  id: "01a17950-b221-7126-bd52-7e93a4c10f38",
  purpose:
    "Own the CLI's failure surface: one error type that marks a failure a command expects to explain, the test that " +
    "tells such a failure from a bug, and the rule that flattens any thrown value into exactly one stderr line. " +
    "Classifies and formats only: prints nothing, chooses no exit code, names no command.",
  status: "built",
  source: ["packages/cli/src/shared/failure.ts"],
  ports: {
    format: {
      kind: "call",
      purpose: "Flatten a thrown value to one stderr line",
      input: "any thrown value",
      output: "one non-empty line, without newlines",
      errors: [],
    },
    isExpected: {
      kind: "call",
      purpose: "Say whether a command expects to explain a thrown value",
      input: "any thrown value",
      output: "true for a CliError or a filesystem failure, a thrown Error carrying a numeric errno, else false",
      errors: [],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "A failure a command expects is a CliError or a filesystem failure, a thrown Error carrying a numeric errno; anything else is a bug and is rethrown, not formatted.",
    },
    {
      id: "R2",
      text: "The line is the error's message, otherwise String(value); every whitespace run around a newline collapses to one space and the result is trimmed.",
    },
    { id: "R3", text: "The line is never empty: a missing or blank message becomes 'unknown error'." },
    {
      id: "C1",
      kind: "constraint",
      text: "No printing, command prefix, exit code or message vocabulary; commands own their line.",
    },
  ],
  testCases: [
    {
      text: "A multi-line Error message becomes one space-separated line; a thrown string and a thrown plain object become their string forms.",
      demonstrates: ["R2"],
    },
    {
      text: "An empty message, a blank message and a thrown empty string all give 'unknown error', and a CliError is a distinct type from a plain Error.",
      demonstrates: ["R1", "R3"],
    },
    {
      text: "A CliError and a filesystem Error carrying an errno are expected; a TypeError, a thrown string, a plain object with an errno and null are bugs.",
      demonstrates: ["R1"],
    },
  ],
  decisions: [
    {
      decision:
        "One shared error type, classifier and formatter; each command keeps its own prefix, wording and exit code.",
      why: "LoadWorld throws while Init, New and map print, so the type must be shared for the expected-failure test to work across nodes, while the words stay with the command that knows the context.",
      rejected: [
        {
          option: "A private error class and formatter per command",
          why: "Three copies of one rule drift and stderr stops being one line per failure.",
        },
      ],
    },
    {
      decision:
        "A filesystem failure, a thrown Error carrying a numeric errno, counts as a failure a command expects, decided here once.",
      why: "Reading and writing fail operationally (permissions, disk full, a path in the way) inside shared nodes whose own contracts list no errors, and both Init and New needed the same test to keep such a failure off the crash path.",
      rejected: [
        {
          option: "Only a CliError counts; every leaf wraps its own filesystem errors",
          why: "Inspect would stop deciding nothing and start naming failures, and the wrapping drifts per leaf.",
        },
        {
          option: "A private classifier per command",
          why: "Identical copies drift apart and stderr stops being one line per failure.",
        },
      ],
    },
  ],
}).edges({});
