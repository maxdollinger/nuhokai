import { node } from "@nuhokai/world";

/** The failure surface: an expectable failure, and the rule that makes it one line. */
export const Failure = node({
  id: "01a17950-b221-7126-bd52-7e93a4c10f38",
  purpose:
    "Own the CLI's failure surface: one error type that marks a failure a command expects to explain, and the rule " +
    "that flattens any thrown value into exactly one stderr line. Types and formats only: prints nothing, chooses no " +
    "exit code, names no command.",
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
  },
  requirements: [
    {
      id: "R1",
      text: "A failure a command expects is a CliError; anything else is a bug and is rethrown, not formatted.",
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
  ],
  decisions: [
    {
      decision: "One shared error type and one formatter; each command keeps its own prefix and wording.",
      why: "ResolveTarget throws while Init and New print, so the type must be shared for the expected-failure test to work across nodes, while the words stay with the command that knows the context.",
      rejected: [
        {
          option: "A private error class and formatter per command",
          why: "Three copies of one rule drift and stderr stops being one line per failure.",
        },
      ],
    },
  ],
}).edges({});
