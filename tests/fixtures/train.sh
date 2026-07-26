#!/usr/bin/env bash
# Regenerate tests/fixtures/tiny.model{,.zst} from corpus.tok.
#
# The `train` CLI is not part of the `vaporetto` crate on crates.io (library
# only), so we build it from the upstream repository checkout.
set -euo pipefail

FIXTURES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$FIXTURES/../.." && pwd)"
WORK="$ROOT/tmp/vaporetto-train"

# Pin to the revision the fixtures were generated with.
VAPORETTO_REV="15baaa02514f1e1c2692eef0b163876b416fd90f"

if [ ! -d "$WORK/.git" ]; then
  git clone https://github.com/daac-tools/vaporetto.git "$WORK"
fi
git -C "$WORK" fetch --depth 1 origin "$VAPORETTO_REV" 2>/dev/null || true
git -C "$WORK" checkout --quiet "$VAPORETTO_REV"

cargo build --release --manifest-path "$WORK/Cargo.toml" -p train

"$WORK/target/release/train" \
  --tok "$FIXTURES/corpus.tok" \
  --model "$FIXTURES/tiny.model.zst" \
  --solver 5

# `train` only emits zstd. Vaporetto's own API reads uncompressed bytes, and we
# want to exercise both fromModel and fromCompressedModel, so keep both forms.
python3 - "$FIXTURES" <<'PY'
import sys, zstandard
fx = sys.argv[1]
with open(f"{fx}/tiny.model.zst", "rb") as f, open(f"{fx}/tiny.model", "wb") as o:
    zstandard.ZstdDecompressor().copy_stream(f, o)
PY

ls -l "$FIXTURES/tiny.model" "$FIXTURES/tiny.model.zst"
