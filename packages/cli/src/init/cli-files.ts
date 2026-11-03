import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { nameInWorld, WORLD_TSCONFIG, WORLD_TYPES_PATH } from "../shared/world-path.ts";
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
      "@nuhokai/world": ["./${WORLD_TYPES_PATH}"]
    }
  },
  "include": ["./**/*.ts"]
}
`;

/** Lay down the CLI-owned files inside an existing directory; answers their paths inside the world folder. */
export function writeCliFiles(dir: string): string[] {
  mkdirSync(dirname(nameInWorld(dir, WORLD_TYPES_PATH)), { recursive: true });
  writeFileSync(nameInWorld(dir, WORLD_TSCONFIG), TSCONFIG_TEMPLATE);
  writeFileSync(nameInWorld(dir, WORLD_TYPES_PATH), WORLD_TYPES);
  return [WORLD_TSCONFIG, WORLD_TYPES_PATH];
}
