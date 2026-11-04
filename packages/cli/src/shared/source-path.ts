/** A source entry as a pattern over paths: whether it is a glob, where its files lie, which paths it matches. Pure. */

/** Bun's glob syntax: an entry with none of these characters is a plain path (SourcePath R2). */
const GLOB_CHARS = /[*?[\]{}!\\]/;

/** Whether a source entry holds a glob character, so it names a pattern rather than one path. */
export function isGlob(entry: string): boolean {
  return GLOB_CHARS.test(entry);
}

/**
 * The directory every file an entry matches lies below: its segments before the first one holding a glob character,
 * `/`-joined, '' for the project directory. A plain path's is its directory.
 */
export function staticPrefix(entry: string): string {
  const segments = entry.split("/");
  const firstGlob = segments.findIndex((segment) => isGlob(segment));
  return segments.slice(0, firstGlob === -1 ? -1 : firstGlob).join("/");
}

/**
 * Whether an entry matches a `/`-separated path relative to the project directory: Bun's glob syntax for a glob, the
 * path itself for a plain path (SourcePath R1).
 */
export function matches(entry: string, path: string): boolean {
  return isGlob(entry) ? new Bun.Glob(entry).match(path) : entry === path;
}
