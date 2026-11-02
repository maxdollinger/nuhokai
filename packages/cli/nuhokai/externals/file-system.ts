import { node } from "@nuhokai/world";

/** The disk under the project directory: where the world is read from and everything nuhokai writes goes. */
export const FileSystem = node({
  id: "01a19d0d-f3b7-7156-a269-7921e6c90b99",
  external: true,
  externalType: "db",
  purpose:
    "The operating system's filesystem: the project directory's files, the world in nuhokai/ and everything the " +
    "CLI writes. The only state nuhokai keeps; no database, cache or config elsewhere.",
  status: "built",
  source: [],
  ports: {
    read: {
      kind: "call",
      purpose: "Observe what is at a path: stat or lstat it, list a directory, resolve a symlink, read a file",
      input: "a path, cwd-relative",
      output: "the entry's kind, a directory's entries, the real path or a file's text",
      errors: ["errno failure: missing entry, permission, a symlink that cannot be resolved"],
    },
    write: {
      kind: "call",
      purpose:
        "Change what is at a path: create directories (also a fresh temporary one), write a file, rename, remove a tree",
      input: "a path, cwd-relative, and the content",
      output: "nothing",
      errors: ["errno failure: permission, disk full, a path in the way"],
    },
  },
  requirements: [
    {
      id: "R1",
      text: "Every failure is a thrown Error with a numeric errno, which Failure.isExpected counts as expected.",
    },
    { id: "R2", text: "A rename within one filesystem is atomic: Publish's commit." },
    { id: "R3", text: "stat and realpath follow symlinks, lstat does not: Inspect tells a linked world apart." },
  ],
}).edges({});
