import { node } from "@nuhokai/world";
import { Tsgo } from "./external.ts";
import { Failure } from "./failure.ts";

/** The CLI's one client of its pinned type checker. Shared by LoadWorld and TypeCheck. */
export const CheckerClient = node({
  id: "01a1a1ad-ebfb-74ab-8f7a-f62a2c5ec333",
  purpose:
    "Find the pinned checker and hold one session on one project: open it, hand it to the caller's work, always " +
    "close it; every checker failure is one CliError, a programming error never disguised as one. Shared, so " +
    "LoadWorld and TypeCheck talk to the checker the same way and neither reaches into the other.",
  status: "built",
  source: ["src/shared/checker-client.ts"],
  ports: {
    session: {
      kind: "call",
      purpose: "Run work against one project in the checker",
      input:
        "project directory, the tsconfig (absolute; on disk or served from memory), its name for messages, the checker, the work",
      output: "what the work answers",
      errors: [
        "no type checker: the sidecar or the platform package is missing",
        "the type checker failed: it did not start, answer or close",
        "the type checker opened no project for the tsconfig",
      ],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "The compiled CLI uses the tsgo sidecar next to its binary; from source, the pinned typescript's platform build; never the repo's own TypeScript.",
    },
    {
      id: "R2",
      text: "The checker is closed on every path; a failure closing it after another never hides that other.",
    },
    {
      id: "R3",
      text: "A JavaScript runtime error (TypeError, RangeError, ReferenceError) inside a session propagates as it is, with its stack: a bug, never 'the type checker failed'.",
    },
    {
      id: "R4",
      text: "Files can be served from memory by absolute path, so a caller's own tsconfig needs no file on disk and leaves nothing behind.",
    },
  ],
  testCases: [
    {
      text: "A checker path naming nothing, or a file that is no executable → one CliError 'the type checker failed: …'.",
      demonstrates: ["R1", "R2"],
    },
    { text: "A TypeError thrown inside a session → that TypeError, not a CliError.", demonstrates: ["R3"] },
    {
      text: "Loading a world leaves the project and the temporary directory as they were.",
      demonstrates: ["R4"],
    },
  ],
}).edges({ uses: () => [Tsgo.read, Tsgo.check, Failure.format] });
