#!/usr/bin/env bash
# Smoke-test one release archive on its own platform: unpack it, then run it in an
# empty directory with a PATH that has no Node, Bun or TypeScript.
#   init and map work, a clean world type-checks with the bundled tsgo, and a
#   dangling port ref is reported by it.
set -euo pipefail

archive="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
work="$(mktemp -d "${TMPDIR:-/tmp}/nuhokai-smoke.XXXXXX")"
trap 'rm -rf "$work"' EXIT

tar -xzf "$archive" -C "$work"
dist="$work/$(basename "$archive" .tar.gz)"
project="$work/project"
mkdir "$project"
cd "$project"

bare() { env -i PATH=/usr/bin:/bin HOME="$work" "$@"; }

for tool in node bun tsc; do
  if bare sh -c "command -v $tool" >/dev/null; then
    echo "smoke: $tool is on the bare PATH" >&2
    exit 1
  fi
done

bare "$dist/nuhokai" init
bare "$dist/nuhokai" map
test -s nuhokai/.generated/map.html
bare "$dist/tsgo/tsgo" -p nuhokai

cat >nuhokai/broken.ts <<'TS'
import { node } from "@nuhokai/world";
import { Example } from "./example.ts";

export const Broken = node({
  id: "01a17950-b221-7124-8356-08fd2fee0888",
  purpose: "Uses a port Example does not have",
  status: "planned",
  source: [],
}).edges({ uses: () => [Example.gret] });
TS

if output="$(bare "$dist/tsgo/tsgo" -p nuhokai)"; then
  echo "smoke: tsgo accepted a dangling ref" >&2
  exit 1
fi
echo "$output"
if ! grep -q "nuhokai/broken.ts.*'gret' does not exist" <<<"$output"; then
  echo "smoke: tsgo did not report the dangling ref" >&2
  exit 1
fi
echo "smoke: ok"
