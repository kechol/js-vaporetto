#!/usr/bin/env bash
# Rebuild dist/ and fail if it does not match what is committed.
#
# Shared by ci.yml and release.yml. It lives in one file because it did not
# used to: the release workflow kept byte-comparing the .wasm after CI had
# stopped, and that only surfaced when a tag was pushed.
#
# The .wasm is excluded from the comparison on purpose. The same rustc emits a
# different binary depending on the host OS (measured: 316,903 bytes on macOS
# against 316,505 on Linux for identical sources), while every generated .js
# and .d.ts is identical everywhere. The staleness signal comes from
# dist/BUILD_INFO instead, which records a hash of each input, so editing a
# source without rebuilding fails here whatever OS built the committed
# artifacts. That the .wasm itself works is covered by the runtime test jobs,
# which import the committed dist/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PATH="$ROOT/tmp/bin:$PATH"
export PATH

./scripts/build.sh > /dev/null

if ! git diff --exit-code --stat -- dist ':(exclude)dist/*/js_vaporetto_bg.wasm'; then
  echo "::error::dist/ is out of date. Run ./scripts/build.sh (or ./scripts/bump-version.sh) and commit the result." >&2
  exit 1
fi

echo "dist/ matches the sources"
