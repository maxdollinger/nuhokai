import { CliError, isExpected, oneLine } from "../shared/failure.ts";
import { fromRoot, WORLD_DIR, WORLD_INDEX, worldFile } from "../shared/paths.ts";
import { inspectTarget } from "../target/inspect.ts";
import { createNodeFile } from "./node-file.ts";

/** Kebab-case, at least one letter, no extension, no dot segment, no leading dash. */
const SEGMENT = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** The only segment that may not name a node file: it is the world entry point. */
const RESERVED = "index";

/** What the run port may observe and answer; the defaults are the real process. */
export interface NewEnvironment {
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
  /** A fresh node id; the default is a uuidv7. */
  readonly newId?: () => string;
}

/** The run port's result, before it becomes lines and an exit code. */
export type AddNodeOutcome =
  | { readonly kind: "written"; readonly path: string }
  | { readonly kind: "failed"; readonly code: 1 | 2; readonly message: string };

/** A parsed argument: the kebab-case segments inside the world's folder, and the export name. */
interface NodePath {
  /** The path segments inside the world folder: kebab-case, no extension. */
  readonly segments: readonly string[];
  /** The export name: the last segment in PascalCase. */
  readonly name: string;
}

/** The PascalCase export name of a kebab-case segment. */
function pascalCase(segment: string): string {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** The path rule: kebab-case segments, the last one is not index, the name is its PascalCase. */
function parsePath(argument: string): NodePath {
  const segments = argument.split("/");
  const last = segments[segments.length - 1] ?? "";
  const bad = segments.some((segment) => !SEGMENT.test(segment));
  if (bad || last === RESERVED) {
    throw new CliError(
      `invalid path '${argument}': segments are kebab-case, have no extension, and the last one is not ${RESERVED}`,
    );
  }
  return { segments, name: pascalCase(last) };
}

/** Parse, inspect, id, create: the order is the program. Writes and prints nothing. */
export async function addNode(
  root: string,
  argument: string,
  environment: NewEnvironment = {},
): Promise<AddNodeOutcome> {
  let target: NodePath;
  try {
    target = parsePath(argument);
  } catch (error) {
    // A bad path fails before anything is read or written.
    if (!isExpected(error)) throw error;
    return { kind: "failed", code: 2, message: oneLine(error) };
  }

  try {
    const state = inspectTarget(root);
    if (state.kind === "absent") {
      throw new CliError(`no ${WORLD_DIR}/ in ${root}; run \`nuhokai init\` or pass --path <dir>`);
    }
    if (state.kind === "occupied") {
      throw new CliError(`${WORLD_DIR} exists but is not a directory`);
    }

    // The last segment is the file's stem, so it takes the extension WorldPath does not add.
    const stem = target.segments[target.segments.length - 1] ?? "";
    const file = worldFile(root, ...target.segments.slice(0, -1), `${stem}.ts`);
    createNodeFile(file.absolute, target.name, (environment.newId ?? Bun.randomUUIDv7)());
    return { kind: "written", path: file.fromRoot };
  } catch (error) {
    // Expected failures become one stderr line; a bug crashes with its stack.
    if (!isExpected(error)) throw error;
    return { kind: "failed", code: 1, message: oneLine(error) };
  }
}

/**
 * The new command: add one node file to the world in the project directory, or say why not.
 * Prints the two possible line sets here and resolves to the process exit code;
 * programming errors propagate and crash with their stack.
 */
export async function runNew(root: string, argument: string, environment: NewEnvironment = {}): Promise<number> {
  const out = environment.out ?? ((line: string) => console.log(line));
  const err = environment.err ?? ((line: string) => console.error(line));

  const outcome = await addNode(root, argument, environment);
  switch (outcome.kind) {
    case "written":
      out(outcome.path);
      out(`next: add it to ${fromRoot(WORLD_INDEX)}`);
      return 0;
    case "failed":
      err(`nuhokai new: ${outcome.message}`);
      return outcome.code;
  }
}
