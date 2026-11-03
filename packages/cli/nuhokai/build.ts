import { node } from "@nuhokai/world";
import { Cli } from "./cli.ts";
import { BunRuntime, FileSystem, Tsgo } from "./external.ts";

/** How the CLI is made and shipped. Runs on a developer's machine and in CI, never inside nuhokai. */
export const Build = node({
  id: "01a19fc4-c9e7-7008-99ba-a816600a1088",
  purpose:
    "Make and ship the CLI: generate the embedded assets (the @nuhokai/world declarations, three.js and the map's " +
    "viewer), compile a per-platform release archive with the tsgo sidecar, and smoke-test it. Build time only: " +
    "nothing here is a dependency of the shipped binary.",
  status: "built",
  source: ["scripts/**", "src/toolchain/**"],
  ports: {
    embed: {
      kind: "call",
      purpose: "Regenerate the embedded assets and this repo's worlds' copies of the declarations (bun run embed)",
      output: "the paths written; none when all are current",
      errors: ["tsc failed to emit the @nuhokai/world declarations", "bundling three.js failed"],
    },
    packageRelease: {
      kind: "call",
      purpose: "Compile this machine's target into a release archive",
      output: "dist/release/nuhokai-v<version>-<target>.tar.gz",
      errors: ["the target is not supported", "a build or copy step failed"],
    },
    smokeTest: {
      kind: "call",
      purpose: "Run a release archive's binary on a fresh project",
      input: "a release archive",
      output: "exit 0, or the first step that failed",
    },
  },
  requirements: [
    {
      id: "R1",
      text: "bun test fails when an embedded asset or a world's copy of the declarations is stale; embed regenerates them all.",
    },
    {
      id: "R2",
      text: "The declarations come from packages/world, emitted by the repo's own tsc and bundled into one self-contained .d.ts; the map assets from the exactly pinned three dev dependency plus src/map/viewer.html and scene.js.",
    },
    {
      id: "R3",
      text: "A release archive holds nuhokai, tsgo/ (tsgo, its lib.*.d.ts, Microsoft's detached signature, LICENSE and NOTICE) and LICENSE.",
    },
    {
      id: "R4",
      text: "The smoke test runs the archive's own binary: init, map and a dangling ref reported by the bundled tsgo, in an empty directory with no Node on the PATH.",
    },
  ],
  testCases: [
    {
      text: "A committed asset or a nuhokai/.generated/world/index.d.ts one edit away from the rendered one → bun test fails; bun run embed makes it pass again.",
      demonstrates: ["R1"],
    },
    {
      text: "A consumer world type-checked against the embedded declarations alone still gets the brand, flag and child errors.",
      demonstrates: ["R2"],
    },
    {
      text: "CI builds, packages and smoke-tests the linux-x64 archive on every pull request.",
      demonstrates: ["R3", "R4"],
    },
  ],
  decisions: [
    {
      decision: "Build is a node of its own, not part of Cli or MapFile.",
      why: "What makes the CLI is not what the CLI does: bundling, emitting declarations and writing archives are no dependency of the shipped binary, and as Cli's or MapFile's edges they read as one.",
      rejected: [
        {
          option: "scripts/ in Cli's and MapFile's source",
          why: "Their edges then mix build time and run time (Cli seemed to compile, MapFile to bundle).",
        },
      ],
    },
  ],
}).edges({ uses: () => [Cli.dispatch, BunRuntime.build, Tsgo.emit, FileSystem.read, FileSystem.write] });
