#!/usr/bin/env bash
# Install the exact toolchain versions this project builds with into tmp/bin/.
#
# Everything is pinned on purpose:
#   * wasm-pack 0.15.0 — 0.14.0's npm package still points at the pre-move
#     drager/wasm-pack release URL and 404s (wasm-bindgen/wasm-pack#1577).
#     Note the repository moved from drager/wasm-pack to wasm-bindgen/wasm-pack.
#   * wasm-bindgen-cli must match the wasm-bindgen crate version exactly or the
#     schema check fails. wasm-pack reads the version from Cargo.lock, which is
#     why Cargo.lock is committed.
#     wasm-pack 0.15.0 also cannot resolve a prebuilt wasm-bindgen for macOS
#     aarch64 and falls back to a slow `cargo install`; having the binary on
#     PATH avoids that (fixed upstream in wasm-bindgen/wasm-pack#1585, unreleased).
#   * binaryen — wasm-pack 0.15.0 hardcodes version_117 (2024-02-28) and offers
#     no way to override it from Cargo.toml, so we ship our own.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/tmp/bin"
mkdir -p "$BIN"

WASM_PACK_VERSION="0.15.0"
BINARYEN_VERSION="version_131"
WASM_BINDGEN_VERSION="$(grep -A1 '^name = "wasm-bindgen"$' "$ROOT/Cargo.lock" | grep '^version' | head -1 | cut -d'"' -f2)"

# The three tools use three different naming schemes for the same platform,
# and none of them can be guessed from the others:
#
#   wasm-pack / wasm-bindgen   Rust target triple, but linux is *-musl only
#                              (there is no x86_64-unknown-linux-gnu asset)
#   binaryen                   its own short names: x86_64-linux, arm64-macos,
#                              x86_64-windows
#
# On Windows the shell is Git Bash, so `uname -s` reports MINGW64_NT-… and the
# binaries carry a .exe suffix.
EXE=""
case "$(uname -s)" in
  Darwin) OS=macos ;;
  Linux)  OS=linux ;;
  MINGW* | MSYS* | CYGWIN*) OS=windows; EXE=".exe" ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) ARCH=aarch64 ;;
  x86_64 | amd64)  ARCH=x86_64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

case "$OS-$ARCH" in
  macos-aarch64)   RUST_TRIPLE="aarch64-apple-darwin";        BINARYEN_ARCH="arm64-macos" ;;
  macos-x86_64)    RUST_TRIPLE="x86_64-apple-darwin";         BINARYEN_ARCH="x86_64-macos" ;;
  linux-aarch64)   RUST_TRIPLE="aarch64-unknown-linux-musl";  BINARYEN_ARCH="aarch64-linux" ;;
  linux-x86_64)    RUST_TRIPLE="x86_64-unknown-linux-musl";   BINARYEN_ARCH="x86_64-linux" ;;
  windows-x86_64)  RUST_TRIPLE="x86_64-pc-windows-msvc";      BINARYEN_ARCH="x86_64-windows" ;;
  windows-aarch64) RUST_TRIPLE="";                            BINARYEN_ARCH="arm64-windows" ;;
  *) echo "unsupported platform: $OS-$ARCH" >&2; exit 1 ;;
esac
if [ -z "$RUST_TRIPLE" ]; then
  echo "no prebuilt wasm-pack/wasm-bindgen for $OS-$ARCH" >&2
  exit 1
fi

fetch() { curl -sSLf -o "$2" "$1"; }

if [ ! -x "$BIN/wasm-pack$EXE" ]; then
  echo "installing wasm-pack $WASM_PACK_VERSION ($RUST_TRIPLE)"
  fetch "https://github.com/wasm-bindgen/wasm-pack/releases/download/v$WASM_PACK_VERSION/wasm-pack-v$WASM_PACK_VERSION-$RUST_TRIPLE.tar.gz" "$BIN/wp.tar.gz"
  tar xzf "$BIN/wp.tar.gz" --strip-components=1 -C "$BIN" "*/wasm-pack$EXE"
  rm -f "$BIN/wp.tar.gz"
fi

if [ ! -x "$BIN/wasm-bindgen$EXE" ]; then
  echo "installing wasm-bindgen $WASM_BINDGEN_VERSION ($RUST_TRIPLE)"
  fetch "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/$WASM_BINDGEN_VERSION/wasm-bindgen-$WASM_BINDGEN_VERSION-$RUST_TRIPLE.tar.gz" "$BIN/wb.tar.gz"
  tar xzf "$BIN/wb.tar.gz" --strip-components=1 -C "$BIN"
  rm -f "$BIN/wb.tar.gz" "$BIN/README.md" "$BIN/LICENSE-APACHE" "$BIN/LICENSE-MIT"
fi

if [ ! -x "$BIN/binaryen-$BINARYEN_VERSION/bin/wasm-opt$EXE" ]; then
  echo "installing binaryen $BINARYEN_VERSION ($BINARYEN_ARCH)"
  fetch "https://github.com/WebAssembly/binaryen/releases/download/$BINARYEN_VERSION/binaryen-$BINARYEN_VERSION-$BINARYEN_ARCH.tar.gz" "$BIN/binaryen.tar.gz"
  tar xzf "$BIN/binaryen.tar.gz" -C "$BIN"
  rm -f "$BIN/binaryen.tar.gz"
fi

rustup target add wasm32-unknown-unknown >/dev/null

echo
"$BIN/wasm-pack$EXE" --version
"$BIN/wasm-bindgen$EXE" --version
"$BIN/binaryen-$BINARYEN_VERSION/bin/wasm-opt$EXE" --version
echo
echo "Add to PATH:  export PATH=\"$BIN:\$PATH\""
