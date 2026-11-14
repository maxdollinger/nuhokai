#!/usr/bin/env bash
# Install the nuhokai CLI from its GitHub releases.
#
#   curl -fsSL https://raw.githubusercontent.com/maxdollinger/nuhokai/main/install.sh | bash
#
# Environment:
#   NUHOKAI_VERSION    the version to install, e.g. 0.1.0 (default: the latest release)
#   NUHOKAI_INSTALL    where to install (default: ~/.nuhokai); the binary goes into its bin/
#   NUHOKAI_NO_MODIFY_PATH=1   do not add the bin/ folder to your shell's startup file
#
# Supported: macOS on Apple silicon, Linux on x64 and arm64. The archive is checked against the
# release's SHA256SUMS before anything is installed.
set -euo pipefail

repo="https://github.com/maxdollinger/nuhokai"
releases="${NUHOKAI_RELEASES_URL:-$repo/releases}" # overridable for testing only

fail() {
  echo "nuhokai install: $*" >&2
  exit 1
}

need() { command -v "$1" >/dev/null 2>&1 || fail "needs $1, which is not installed"; }

tmp=""
trap '[ -z "$tmp" ] || rm -rf "$tmp"' EXIT

# Everything runs from main, called on the last line: a download cut off midway runs nothing.
main() {
  need curl
  need tar
  need uname

  # ---------- target ----------
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os/$arch" in
  Darwin/arm64) target="darwin-arm64" ;;
  Darwin/x86_64)
    # Rosetta reports x86_64 to a translated shell; the hardware may still be Apple silicon.
    if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
      target="darwin-arm64"
    else
      fail "macOS on Intel is not supported yet; see $repo"
    fi
    ;;
  Linux/x86_64 | Linux/amd64) target="linux-x64" ;;
  Linux/aarch64 | Linux/arm64) target="linux-arm64" ;;
  *) fail "no release for $os on $arch; see $repo" ;;
  esac

  # ---------- version ----------
  version="${NUHOKAI_VERSION:-}"
  version="${version#v}"
  if [ -z "$version" ]; then
    # /releases/latest redirects to /releases/tag/v<version>; no API call, so no rate limit.
    latest="$(curl -fsS -o /dev/null -w '%{redirect_url}' "$releases/latest")" ||
      fail "could not reach $releases"
    version="${latest##*/v}"
    [ -n "$version" ] && [ "$version" != "$latest" ] || fail "could not find the latest release at $releases"
  fi

  name="nuhokai-v$version-$target"
  url="$releases/download/v$version"

  # ---------- download and verify ----------
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/nuhokai-install.XXXXXX")"

  echo "Installing nuhokai $version ($target)"
  curl -fsSL -o "$tmp/$name.tar.gz" "$url/$name.tar.gz" || fail "could not download $url/$name.tar.gz"
  curl -fsSL -o "$tmp/SHA256SUMS" "$url/SHA256SUMS" || fail "could not download $url/SHA256SUMS"

  expected="$(awk -v f="$name.tar.gz" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")"
  [ -n "$expected" ] || fail "SHA256SUMS lists no $name.tar.gz"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$tmp/$name.tar.gz" | awk '{ print $1 }')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$tmp/$name.tar.gz" | awk '{ print $1 }')"
  else
    fail "needs sha256sum or shasum to verify the download"
  fi
  [ "$actual" = "$expected" ] || fail "checksum mismatch for $name.tar.gz: expected $expected, got $actual"

  tar -xzf "$tmp/$name.tar.gz" -C "$tmp"
  [ -x "$tmp/$name/nuhokai" ] && [ -d "$tmp/$name/tsgo" ] || fail "the archive does not hold nuhokai and tsgo/"

  # ---------- install ----------
  # Only nuhokai's own files are replaced: the binary, its type checker in tsgo/ and the LICENSE.
  install_dir="${NUHOKAI_INSTALL:-$HOME/.nuhokai}"
  bin="$install_dir/bin"
  mkdir -p "$bin"
  rm -rf "$bin/tsgo" "$bin/nuhokai" "$bin/LICENSE"
  mv "$tmp/$name/tsgo" "$tmp/$name/nuhokai" "$tmp/$name/LICENSE" "$bin/"

  "$bin/nuhokai" --help >/dev/null || fail "installed, but $bin/nuhokai does not run"
  echo "Installed $bin/nuhokai"

  # ---------- PATH ----------
  case ":$PATH:" in
  *":$bin:"*)
    echo "Run: nuhokai --help"
    return 0
    ;;
  esac

  line="export PATH=\"$bin:\$PATH\""
  case "$(basename "${SHELL:-}")" in
  zsh) rc="${ZDOTDIR:-$HOME}/.zshrc" ;;
  bash)
    # macOS opens login shells, which read .bash_profile and not .bashrc.
    if [ "$os" = "Darwin" ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi
    ;;
  fish) rc="${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish" line="fish_add_path \"$bin\"" ;;
  *) rc="" ;;
  esac

  if [ "${NUHOKAI_NO_MODIFY_PATH:-}" != "1" ] && [ -n "$rc" ]; then
    if ! grep -qsF "$bin" "$rc"; then
      mkdir -p "$(dirname "$rc")"
      printf '\n# nuhokai\n%s\n' "$line" >>"$rc"
      echo "Added $bin to PATH in $rc"
    fi
    echo "Open a new shell, then run: nuhokai --help"
  else
    echo "Add nuhokai to your PATH, then run: nuhokai --help"
    echo "  $line"
  fi
}

main "$@"
