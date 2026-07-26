#!/usr/bin/env bash
# Bump the version everywhere it appears, then rebuild dist/.
#
#   ./scripts/bump-version.sh 0.2.0
#   ./scripts/bump-version.sh 0.2.0 --no-build   # skip the dist/ rebuild
#
# The version lives in five places and all of them matter:
#
#   Cargo.toml     the [package] version — also the source scripts/build.sh
#                  reads, so it drives JS_VAPORETTO_VERSION in dist/
#   Cargo.lock     records the local package's version
#   package.json   what npm and the release workflow check against the tag
#   README.md      four pinned install URLs; these are instructions users
#   README.ja.md   copy and paste, not advisory prose
#
# Rebuilding dist/ is part of the bump, not an afterthought: the version is
# baked into the generated wrappers, and .github/workflows/release.yml fails
# the tag if dist/ does not match the sources.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NEW="${1:-}"
BUILD=1
[ "${2:-}" = "--no-build" ] && BUILD=0

if [ -z "$NEW" ]; then
  echo "usage: $0 <new-version> [--no-build]" >&2
  exit 1
fi
if ! printf '%s' "$NEW" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "not a semver version: $NEW" >&2
  exit 1
fi

OLD_PKG="$(node -p 'require("./package.json").version')"
OLD_CRATE="$(awk -F'"' '/^version = /{print $2; exit}' Cargo.toml)"
if [ "$OLD_PKG" != "$OLD_CRATE" ]; then
  echo "package.json ($OLD_PKG) and Cargo.toml ($OLD_CRATE) already disagree; fix that first" >&2
  exit 1
fi
OLD="$OLD_PKG"

if [ "$OLD" = "$NEW" ]; then
  echo "already at $NEW; nothing to do" >&2
  exit 1
fi

echo "bumping $OLD -> $NEW"

# Cargo.toml: only the first `version = ` line, which is the [package] one.
# The `version = "=0.6.5"` pins on vaporetto must not be touched. BSD sed has
# no `0,/re/` address form, so do it in awk rather than with a portability
# guess.
awk -v new="$NEW" '
  !done && /^version = / { sub(/"[^"]*"/, "\"" new "\""); done = 1 }
  { print }
' Cargo.toml > Cargo.toml.tmp && mv Cargo.toml.tmp Cargo.toml

# Refreshes the local package's version in the lockfile. --workspace keeps it
# to workspace members; `cargo metadata` looks like it would do this but does
# not write the lockfile at all.
cargo update --workspace --quiet

node -e '
  const fs = require("node:fs");
  const p = "package.json";
  const c = JSON.parse(fs.readFileSync(p, "utf8"));
  c.version = process.argv[1];
  fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
' "$NEW"

# `#vX.Y.Z` for the npm/bun install lines, `/vX.Y.Z/` for the raw URLs.
for f in README.md README.ja.md; do
  sed -e "s|js-vaporetto#v${OLD}|js-vaporetto#v${NEW}|g" \
      -e "s|js-vaporetto/v${OLD}/|js-vaporetto/v${NEW}/|g" \
      "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done

# --- verify every place actually moved ----------------------------------------
fail=0
check() {
  local label="$1" actual="$2"
  if [ "$actual" = "$NEW" ]; then
    printf '  %-14s %s\n' "$label" "$actual"
  else
    printf '  %-14s %s  <- expected %s\n' "$label" "$actual" "$NEW"
    fail=1
  fi
}
check "Cargo.toml" "$(awk -F'"' '/^version = /{print $2; exit}' Cargo.toml)"
check "Cargo.lock" "$(awk '/^name = "js-vaporetto"$/{getline; gsub(/[^0-9.]/, "", $0); print; exit}' Cargo.lock)"
check "package.json" "$(node -p 'require("./package.json").version')"

for f in README.md README.ja.md; do
  n=$(grep -cE "js-vaporetto[/#]v${NEW}" "$f" || true)
  stale=$(grep -cE "js-vaporetto[/#]v${OLD}" "$f" || true)
  if [ "$n" -eq 4 ] && [ "$stale" -eq 0 ]; then
    printf '  %-14s 4 pinned URLs\n' "$f"
  else
    printf '  %-14s %s at v%s, %s still at v%s  <- expected 4 and 0\n' "$f" "$n" "$NEW" "$stale" "$OLD"
    fail=1
  fi
done
[ "$fail" -eq 0 ] || { echo "bump incomplete; nothing was rebuilt" >&2; exit 1; }

if [ "$BUILD" -eq 1 ]; then
  echo "rebuilding dist/ (the version is baked into the wrappers)"
  case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) EXE=".exe" ;; *) EXE="" ;; esac
  if ! command -v wasm-pack > /dev/null && [ -x "$ROOT/tmp/bin/wasm-pack$EXE" ]; then
    PATH="$ROOT/tmp/bin:$PATH"
    export PATH
  fi
  ./scripts/build.sh > /dev/null
  # Every directory build.sh writes an entry wrapper into, so adding a target
  # cannot silently drop out of this check.
  targets=$(find dist -name vaporetto.js -exec dirname {} \; | sed 's|^dist/||' | sort)
  for t in $targets; do
    got=$(grep -oE 'JS_VAPORETTO_VERSION = "[^"]*"' "dist/$t/vaporetto.js" | head -1 | cut -d'"' -f2)
    [ "$got" = "$NEW" ] || { echo "dist/$t reports $got, expected $NEW" >&2; exit 1; }
  done
  echo "  dist/ rebuilt; all targets report $NEW ($(echo "$targets" | tr '\n' ' '))"
else
  echo "skipped the dist/ rebuild (--no-build). Run ./scripts/build.sh before committing."
fi

echo
echo "next: update CHANGELOG.md, then commit"
