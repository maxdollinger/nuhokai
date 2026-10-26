import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fromRoot, inWorld, WORLD_TSCONFIG, WORLD_TYPES_DIR, WORLD_TYPES_FILE } from "../shared/paths.ts";
import { WORLD_TYPES } from "../toolchain/world-types.gen.ts";

/**
 * The editor's TypeScript settings: the world's strict options and the
 * @nuhokai/world path mapping to the embedded declarations. Self-contained,
 * so the repo needs no TypeScript and no node_modules.
 */
export const TSCONFIG_TEMPLATE = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "types": [],
    "paths": {
      "@nuhokai/world": ["./${WORLD_TYPES_DIR}/${WORLD_TYPES_FILE}"]
    }
  },
  "include": ["./**/*.ts"]
}
`;

export const TSCONFIG_PATH = fromRoot(WORLD_TSCONFIG);
export const WORLD_TYPES_PATH = fromRoot(WORLD_TYPES_DIR, WORLD_TYPES_FILE);

/** Which CLI-owned files were written, and which were already byte-identical. */
export interface CliFilesResult {
  readonly written: string[];
  readonly unchanged: string[];
}

/** Lay down the CLI-owned files inside an existing directory, never rewriting identical bytes. */
export function writeCliFiles(dir: string): CliFilesResult {
  mkdirSync(inWorld(dir, WORLD_TYPES_DIR), { recursive: true });

  const files: [path: string, absolute: string, content: string][] = [
    [TSCONFIG_PATH, inWorld(dir, WORLD_TSCONFIG), TSCONFIG_TEMPLATE],
    [WORLD_TYPES_PATH, inWorld(dir, WORLD_TYPES_DIR, WORLD_TYPES_FILE), WORLD_TYPES],
  ];

  const written: string[] = [];
  const unchanged: string[] = [];
  for (const [path, absolute, content] of files) {
    if (existsSync(absolute) && readFileSync(absolute, "utf8") === content) {
      unchanged.push(path);
      continue;
    }
    writeFileSync(absolute, content);
    written.push(path);
  }
  return { written, unchanged };
}
