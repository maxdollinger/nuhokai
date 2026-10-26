import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CliError } from "../shared/failure.ts";

/** What may name an export: a PascalCase identifier. */
const NAME = /^[A-Z][a-zA-Z0-9]*$/;
/** What may be a node id: a uuid, lowercase, as Bun.randomUUIDv7 answers. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The bytes of the default node file: one planned leaf with its own `run` call
 * port and TODO placeholders. Deterministic: the same name and id give the
 * same bytes, LF endings, one trailing newline, no timestamp and no path.
 * A name that is not a PascalCase identifier, or an id that is not a uuid,
 * is a caller bug: a TypeError, no bytes.
 */
export function nodeFileSource(name: string, id: string): string {
  if (!NAME.test(name) || !ID.test(id)) {
    throw new TypeError(`nodeFileSource: '${name}' must be a PascalCase identifier and '${id}' must be a uuid`);
  }
  return `import { node } from "@nuhokai/world";

/**
 * TODO: what this node is responsible for and what it deliberately does not do.
 * Replace every TODO, then add this export to nuhokai/index.ts.
 */
export const ${name} = node({
  id: "${id}",
  purpose: "TODO: why this node exists",
  status: "planned",
  source: [],
  ports: {
    run: {
      kind: "call",
      purpose: "TODO: what calling this port is for",
      input: "TODO: what the caller passes",
      output: "TODO: what it answers",
    },
  },
}).edges({});
`;
}

/**
 * Create the node file at exactly `path`, with its missing parent directories.
 * Never overwrites: an existing file or directory at the path is one error and
 * stays as it was. A failed write removes the partial file; a failing removal
 * does not replace the original error. A bad name or id is a caller bug and
 * fails before anything is created.
 */
export function createNodeFile(path: string, name: string, id: string): string {
  const source = nodeFileSource(name, id);
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, source, { flag: "wx" });
  } catch (error) {
    // "wx" never touched an existing file, so it must stay exactly as it was.
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new CliError(`the file already exists: ${path}`);
    }
    try {
      rmSync(path, { force: true });
    } catch {
      // The write already decided; a leftover partial file must not mask it.
    }
    throw error;
  }
  return path;
}
