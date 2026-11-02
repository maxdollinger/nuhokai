import { node } from "@nuhokai/world";
import { Cli } from "../cli.ts";

/** Whoever runs nuhokai: a person at a shell, a script or a CI step. */
export const Terminal = node({
  id: "01a19d0d-f3b2-75ea-839d-c2a3a079b878",
  external: true,
  externalType: "caller",
  purpose:
    "Whoever runs nuhokai: a person at a shell (a tty), a script or a CI step. Starts the process with argv in a " +
    "working directory, reads its stdout and stderr lines and branches on the exit code. Never asked anything.",
  status: "built",
  source: [],
  ports: {
    stdout: {
      kind: "call",
      purpose: "Take one line of a command's result: a written path, a diagnostic, a tree line, the usage",
      input: "one line of text",
    },
    stderr: {
      kind: "call",
      purpose: "Take one line about a failure or a wrong invocation, prefixed 'nuhokai <command>: '",
      input: "one line of text, or the usage after a usage error",
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Plain lines only: no colour, cursor control or progress; output is the same on a tty and through a pipe, so grep and scripts read it as printed.",
    },
    {
      id: "R2",
      text: "Never prompted: nothing reads stdin, so every command runs unattended (Cli: project directory = the cwd or --path).",
    },
    { id: "R3", text: "Paths it reads are named from its working directory, so they open as printed." },
  ],
}).edges({ uses: () => [Cli.dispatch] });
