import { node } from "@nuhokai/world";

/** Whoever runs nuhokai: a person at a shell, a script or a CI step. */
export const Terminal = node({
  id: "01a19d0d-f3b2-75ea-839d-c2a3a079b878",
  external: true,
  externalType: "caller",
  purpose:
    "Whoever runs nuhokai: a person at a shell (a tty), a script or a CI step. Calls Cli.dispatch by starting the " +
    "process with argv in a working directory, reads its stdout and stderr lines and branches on the exit code. " +
    "Never asked anything.",
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
  decisions: [
    {
      decision: "No uses edge to Cli.dispatch; the purpose names it.",
      why: "Every command's leaf imports Terminal for stdout and stderr, so Terminal importing Cli would close an import cycle through the commands' domes, whose children are read eagerly: the loader, evaluating files in sorted order, would hit a dome before its child exists.",
    },
  ],
}).edges({});
