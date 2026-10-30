import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Package the CLI for the machine this runs on: `bun build --compile` plus the
 * matching tsgo as a sidecar, in one archive per target. Native only: the
 * release builds each target on its own runner so it can smoke-test there.
 */

const PACKAGE_DIR = join(import.meta.dir, "..");
const RELEASE_DIR = join(PACKAGE_DIR, "dist/release");

/** The targets the release ships; darwin-x64 can join once a runner builds it. */
const TARGETS = ["darwin-arm64", "linux-x64", "linux-arm64"] as const;

function fail(message: string): never {
  console.error(`package-release: ${message}`);
  process.exit(1);
}

function run(command: string[], cwd: string): void {
  const result = Bun.spawnSync(command, { cwd, stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) fail(`${command.join(" ")} exited ${result.exitCode}`);
}

const { version } = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")) as { version?: string };
if (!version) fail("packages/cli/package.json has no version");

const target = `${process.platform}-${process.arch}`;
if (!(TARGETS as readonly string[]).includes(target)) fail(`unsupported target ${target}`);

// The repo's pinned TypeScript ships tsgo per platform as an optional dependency, next to its default libs.
const typescriptDir = dirname(realpathSync(Bun.resolveSync("typescript/package.json", PACKAGE_DIR)));
const tsgoPackage = `@typescript/typescript-${target}`;
const tsgoLib = join(dirname(Bun.resolveSync(`${tsgoPackage}/package.json`, typescriptDir)), "lib");

const name = `nuhokai-v${version}-${target}`;
const out = join(RELEASE_DIR, name);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

run([process.execPath, "build", "src/bin.ts", "--compile", "--outfile", join(out, "nuhokai")], PACKAGE_DIR);
copyFileSync(join(PACKAGE_DIR, "LICENSE"), join(out, "LICENSE"));

// tsgo finds its lib.*.d.ts next to the executable, so the directory ships whole, with Microsoft's signature:
// detached as tsc.sig on Linux, embedded in the binary on macOS.
const tsgoDir = join(out, "tsgo");
cpSync(tsgoLib, tsgoDir, { recursive: true });
renameSync(join(tsgoDir, "tsc"), join(tsgoDir, "tsgo"));
if (existsSync(join(tsgoDir, "tsc.sig"))) renameSync(join(tsgoDir, "tsc.sig"), join(tsgoDir, "tsgo.sig"));
for (const file of ["LICENSE", "NOTICE.txt"]) copyFileSync(join(typescriptDir, file), join(tsgoDir, file));

const archive = `${name}.tar.gz`;
rmSync(join(RELEASE_DIR, archive), { force: true });
run(["tar", "-czf", archive, name], RELEASE_DIR);
console.log(join(RELEASE_DIR, archive));
