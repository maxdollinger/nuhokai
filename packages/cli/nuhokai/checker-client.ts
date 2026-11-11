import { node } from "@nuhokai/world";
import { Tsgo } from "./external.ts";
import { Failure } from "./failure.ts";

/** The CLI's one client of its pinned type checker. Shared by LoadWorld and TypeCheck. */
export const CheckerClient = node({
  id: "01a1a1ad-ebfb-74ab-8f7a-f62a2c5ec333",
  purpose:
    "Find the pinned checker and hold one session on one project: open it, hand it to the caller's work, always " +
    "close it; every checker failure is one CliError; whatever else the caller's work throws passes as it is, so a " +
    "programming error is never disguised as one. Shared, so " +
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
        "the type checker failed: it did not start, open the project, answer a request or close",
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
      text: "Inside the caller's work, a request the checker fails (its JSON-RPC rejects it with an Error carrying a numeric code: a protocol error, a closed or disposed connection) is 'the type checker failed: …'; anything else the work throws passes as it is (Failure R1): a CliError or filesystem error for the caller to report, any other error a bug that crashes with its stack.",
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
    {
      text: "A TypeError, a plain Error, an errno error or a CliError thrown inside a session → that very value; an Error with a numeric code (a dropped request) → a CliError 'the type checker failed: …'.",
      demonstrates: ["R3"],
    },
    {
      text: "Loading a world leaves the project and the temporary directory as they were.",
      demonstrates: ["R4"],
    },
  ],
}).edges({ uses: () => [Tsgo.read, Tsgo.check, Failure.format] });
