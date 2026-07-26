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
#
# Every archive is also checked against a sha256 recorded below. Pinning the
# version alone is not enough: a GitHub release asset can be replaced without
# the tag moving, so the version says what we asked for and the hash says what
# we got.
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

# sha256 of each archive, computed from the bytes actually downloaded on
# 2026-07-26 and cross-checked against the checksums upstream publishes where
# they exist — wasm-bindgen (.sha256sum) and binaryen (.sha256) matched 10/10.
# wasm-pack publishes no checksums at all, so those five are trust-on-first-use
# from the bytes recorded here.
#
# To add a platform or bump a version: download the archive, run
# `shasum -a 256 <file>` (or `sha256sum`), and update the matching line.
checksum_for() {
  case "$1" in
    wasm-pack:aarch64-apple-darwin)       echo 0abff4a03d670b6c00ea31d0e1608a72407e355f3d3765e9c30eb45cd5b7e318 ;;
    wasm-pack:x86_64-apple-darwin)        echo d3f1a4a33e95f8f0d7801b024e08624c479999ac96aa150908b2394015cd0363 ;;
    wasm-pack:aarch64-unknown-linux-musl) echo e17ef0806381c3a0acb9c9ddad643a49facaa5a2ecf657a421d4d8f3357a24b7 ;;
    wasm-pack:x86_64-unknown-linux-musl)  echo c09f971ecaed9a2efc80fdcea7a00ef6b53c7fadc8c57d1f61b53a6aa66b668a ;;
    wasm-pack:x86_64-pc-windows-msvc)     echo 518dc51180c7bc864699c9279b3bc99025bc109123e0249a34ba34d130a509bf ;;

    wasm-bindgen:aarch64-apple-darwin)       echo 7df536babe345deb68828148dbdc71179118afdab42d83547c7cebfbf1426bd5 ;;
    wasm-bindgen:x86_64-apple-darwin)        echo 6014dca993c8bf8a6ec10b6fccfbeabf599842d011f58a4abb7669afef784422 ;;
    wasm-bindgen:aarch64-unknown-linux-musl) echo 2245120254a9f6c9a9adf3601f3d52bb31309219e9ceab7696e74e24885c440a ;;
    wasm-bindgen:x86_64-unknown-linux-musl)  echo 064948d58e2d6c0a745216477a639ba696216d6309aaa902939d1b865b1d869d ;;
    wasm-bindgen:x86_64-pc-windows-msvc)     echo 5a3773c7e69cfb2d865e235e9210de184c8c3af1787720646ec1a8bbe09c6179 ;;

    binaryen:arm64-macos)    echo e441b48dc22163d209b4f05e44dc7210909b01237642b6c9ae48fd710a3ef83e ;;
    binaryen:x86_64-macos)   echo d209fadd8a894bdaf3bd3612a23c32a0af184d2f4a979b8c789e6e4f6a4de883 ;;
    binaryen:aarch64-linux)  echo ba991f677edd9a21d2bc96c0144bc8ac5b112d4d98a3eb266e075e22e557df2a ;;
    binaryen:x86_64-linux)   echo b5bf1f0eaf17c63ee588ff7a5954dc8f6ce2c26989051c66f24dfe9ece3e46db ;;
    binaryen:x86_64-windows) echo 2f4edac1703a2f695254d6ff52ede03481e67db1f094915763d863158c17d9bc ;;

    *) echo "" ;;
  esac
}

sha_of() {
  if command -v sha256sum > /dev/null; then sha256sum "$1" | cut -d" " -f1
  else shasum -a 256 "$1" | cut -d" " -f1; fi
}

# Download to $2, then refuse to unpack anything whose hash is not the one
# recorded above. The archive is removed on mismatch so a re-run cannot pick up
# a partially trusted file.
fetch() { # <url> <dest> <checksum-key>
  local url="$1" dest="$2" key="$3" expected actual
  expected="$(checksum_for "$key")"
  if [ -z "$expected" ]; then
    echo "no recorded checksum for $key — refusing to install" >&2
    exit 1
  fi
  curl -sSLf -o "$dest" "$url"
  actual="$(sha_of "$dest")"
  if [ "$actual" != "$expected" ]; then
    rm -f "$dest"
    {
      echo "checksum mismatch for $key"
      echo "  url      $url"
      echo "  expected $expected"
      echo "  actual   $actual"
      echo "If you deliberately changed the version, update checksum_for() in $0."
    } >&2
    exit 1
  fi
}

if [ ! -x "$BIN/wasm-pack$EXE" ]; then
  echo "installing wasm-pack $WASM_PACK_VERSION ($RUST_TRIPLE)"
  fetch "https://github.com/wasm-bindgen/wasm-pack/releases/download/v$WASM_PACK_VERSION/wasm-pack-v$WASM_PACK_VERSION-$RUST_TRIPLE.tar.gz" \
    "$BIN/wp.tar.gz" "wasm-pack:$RUST_TRIPLE"
  # Extract everything and delete the extras rather than passing a glob:
  # GNU tar needs --wildcards for pattern arguments and BSD tar does not
  # accept that flag, so there is no spelling that works on both.
  tar xzf "$BIN/wp.tar.gz" --strip-components=1 -C "$BIN"
  rm -f "$BIN/wp.tar.gz" "$BIN/README.md" "$BIN/LICENSE-APACHE" "$BIN/LICENSE-MIT"
fi

if [ ! -x "$BIN/wasm-bindgen$EXE" ]; then
  echo "installing wasm-bindgen $WASM_BINDGEN_VERSION ($RUST_TRIPLE)"
  fetch "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/$WASM_BINDGEN_VERSION/wasm-bindgen-$WASM_BINDGEN_VERSION-$RUST_TRIPLE.tar.gz" \
    "$BIN/wb.tar.gz" "wasm-bindgen:$RUST_TRIPLE"
  tar xzf "$BIN/wb.tar.gz" --strip-components=1 -C "$BIN"
  rm -f "$BIN/wb.tar.gz" "$BIN/README.md" "$BIN/LICENSE-APACHE" "$BIN/LICENSE-MIT"
fi

if [ ! -x "$BIN/binaryen-$BINARYEN_VERSION/bin/wasm-opt$EXE" ]; then
  echo "installing binaryen $BINARYEN_VERSION ($BINARYEN_ARCH)"
  fetch "https://github.com/WebAssembly/binaryen/releases/download/$BINARYEN_VERSION/binaryen-$BINARYEN_VERSION-$BINARYEN_ARCH.tar.gz" \
    "$BIN/binaryen.tar.gz" "binaryen:$BINARYEN_ARCH"
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
