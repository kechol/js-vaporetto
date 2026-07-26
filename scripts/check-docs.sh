#!/usr/bin/env bash
# Documentation consistency checks, run by the lint job.
#
#   1. README.md and README.ja.md must stay structurally in sync.
#   2. The generated type declarations must not carry Japanese prose. Rust doc
#      comments are copied verbatim into dist/types/index.d.ts and surface in
#      every consumer's editor tooltip, so that text is product documentation
#      and belongs in English. Japanese belongs in README.ja.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

status=0

# --- 1. README parity ---------------------------------------------------------
levels() { grep -oE '^#{1,6}' "$1" | awk '{print length($0)}'; }

if ! diff -u <(levels README.md) <(levels README.ja.md) > /dev/null; then
  echo "README.md and README.ja.md have diverged in heading structure:" >&2
  echo "  README.md    $(grep -c '^#' README.md) headings" >&2
  echo "  README.ja.md $(grep -c '^#' README.ja.md) headings" >&2
  paste -d'\t' <(grep -E '^#{1,6} ' README.md) <(grep -E '^#{1,6} ' README.ja.md) 2>/dev/null | head -40 >&2
  status=1
fi

for f in README.md README.ja.md; do
  other=$([ "$f" = "README.md" ] && echo README.ja.md || echo README.md)
  grep -q "($other)" "$f" || { echo "$f does not link to $other" >&2; status=1; }
done

# --- 2. English-only API documentation ---------------------------------------
# Matches Japanese prose markers rather than any kana, so a Japanese *example*
# inside an English sentence stays allowed — upstream Vaporetto documents
# character classes that way too.
JA_PROSE='する|します|ます|です|である|ため|こと|など|場合|とき|より|から|ように|されて|に対して'

for f in dist/types/index.d.ts src/lib.rs; do
  [ -f "$f" ] || continue
  if hits=$(grep -nE "$JA_PROSE" "$f"); then
    echo "$f contains Japanese prose; API docs and source comments are English-only:" >&2
    echo "$hits" | head -10 >&2
    status=1
  fi
done

[ "$status" -eq 0 ] && echo "docs OK ($(grep -c '^#' README.md) headings, type declarations are English)"
exit "$status"
