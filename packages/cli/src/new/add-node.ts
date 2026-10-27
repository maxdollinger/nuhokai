import { CliError, isExpected, oneLine } from "../shared/failure.ts";
import { requireWorld } from "../shared/inspect.ts";
import { inWorld, WORLD_INDEX } from "../shared/paths.ts";
import { createNodeFile } from "./node-file.ts";

/** Kebab-case, at least one letter, no extension, no dot segment, no leading dash. */
const SEGMENT = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** The only segment that may not name a node file: it is the world entry point. */
const RESERVED = "index";

/** What the run port may observe and answer; the defaults are the real process. */
export interface NewEnvironment {
  readonly out?: (line: string) => void;
  readonly err?: (line: string) => void;
}

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
      `invalid node path '${argument}': segments are kebab-case, have no extension, and the last one is not ${RESERVED}`,
    );
  }
  return { segments, name: pascalCase(last) };
}

/**
 * The new command: parse, inspect, id, create, print; the order is the program.
 * Adds one node file to the world in the project directory `root`, named from
 * the cwd, or says why not, and resolves to the process exit code; programming
 * errors propagate and crash with their stack.
 */
export async function runNew(root: string, argument: string, environment: NewEnvironment = {}): Promise<number> {
  const out = environment.out ?? ((line: string) => console.log(line));
  const err = environment.err ?? ((line: string) => console.error(line));

  let target: NodePath;
  try {
    target = parsePath(argument);
  } catch (error) {
    // A bad path fails before anything is read or written.
    if (!isExpected(error)) throw error;
    err(`nuhokai new: ${oneLine(error)}`);
    return 2;
  }

  try {
    requireWorld(root);

    // The last segment is the file's stem, so it takes the extension WorldPath does not add.
    const stem = target.segments[target.segments.length - 1] ?? "";
    const file = inWorld(root, ...target.segments.slice(0, -1), `${stem}.ts`);
    createNodeFile(file, target.name, Bun.randomUUIDv7());
    out(file);
    out(`next: add it to ${inWorld(root, WORLD_INDEX)}`);
    return 0;
  } catch (error) {
    // Expected failures become one stderr line; a bug crashes with its stack.
    if (!isExpected(error)) throw error;
    err(`nuhokai new: ${oneLine(error)}`);
    return 1;
  }
}
