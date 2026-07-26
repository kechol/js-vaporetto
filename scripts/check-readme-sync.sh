#!/usr/bin/env bash
# README.md and README.ja.md must stay structurally in sync. Comparing the
# heading levels catches the common failure: a section added to one and
# forgotten in the other. Wording is not compared — they are translations, not
# copies.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

levels() { grep -oE '^#{1,6}' "$1" | awk '{print length($0)}'; }

if ! diff -u <(levels README.md) <(levels README.ja.md) > /dev/null; then
  echo "README.md and README.ja.md have diverged in heading structure:" >&2
  echo "  README.md    $(grep -c '^#' README.md) headings" >&2
  echo "  README.ja.md $(grep -c '^#' README.ja.md) headings" >&2
  paste -d'\t' <(grep -E '^#{1,6} ' README.md) <(grep -E '^#{1,6} ' README.ja.md) 2>/dev/null | head -40 >&2
  exit 1
fi

for f in README.md README.ja.md; do
  other=$([ "$f" = "README.md" ] && echo README.ja.md || echo README.md)
  grep -q "($other)" "$f" || { echo "$f does not link to $other" >&2; exit 1; }
done

echo "README.md and README.ja.md are in sync ($(grep -c '^#' README.md) headings)"
