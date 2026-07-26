#!/usr/bin/env bash
# Build every wasm-pack target into dist/, optimize with a pinned wasm-opt, and
# generate the `vaporetto.js` entry wrappers.
#
# Why a wrapper instead of using wasm-pack's output directly:
#   * wasm-bindgen cannot export constants, and the `web` target initializes the
#     wasm module asynchronously, so VAPORETTO_VERSION / JS_VAPORETTO_VERSION
#     cannot be read from wasm at module load time. They are baked in here.
#   * The entry point is named `vaporetto.js` in every target directory so the
#     package.json "exports" map stays uniform.
#
# Why we run wasm-opt ourselves:
#   wasm-pack 0.15.0 hardcodes binaryen version_117 (released 2024-02-28) and
#   Cargo.toml offers no way to pin a different one — the only settings accepted
#   under [package.metadata.wasm-pack.profile.release] are a bool or an argument
#   list. So wasm-opt is disabled there and invoked here with a pinned binary.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BINARYEN_VERSION="version_131"
WASM_OPT_ARGS=(-Oz)
TARGETS=(bundler web nodejs deno)

# --- locate wasm-opt ---------------------------------------------------------
# On Windows the shell is Git Bash and the binaries carry a .exe suffix.
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) EXE=".exe" ;; *) EXE="" ;; esac

WASM_OPT="${WASM_OPT:-}"
if [ -z "$WASM_OPT" ]; then
  for candidate in \
    "$ROOT/tmp/bin/binaryen-$BINARYEN_VERSION/bin/wasm-opt$EXE" \
    "$(command -v wasm-opt || true)"
  do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then WASM_OPT="$candidate"; break; fi
  done
fi
if [ -z "$WASM_OPT" ]; then
  echo "wasm-opt not found. Run scripts/setup-toolchain.sh or set WASM_OPT=." >&2
  exit 1
fi
echo "wasm-opt: $("$WASM_OPT" --version)"

JS_VERSION="$(grep -m1 '^version = ' Cargo.toml | cut -d'"' -f2)"
VAPORETTO_VERSION="$(grep -m1 'version = "=0.6' Cargo.toml | cut -d'"' -f2 | tr -d '=')"
echo "js-vaporetto $JS_VERSION / vaporetto $VAPORETTO_VERSION"

# --- build -------------------------------------------------------------------
for target in "${TARGETS[@]}"; do
  # wasm-pack calls it "nodejs"; we publish it under dist/node/.
  outdir="$target"; [ "$target" = "nodejs" ] && outdir="node"
  echo "== $target -> dist/$outdir =="
  rm -rf "dist/$outdir"
  wasm-pack build --release --target "$target" --out-dir "dist/$outdir"

  # wasm-pack drops a `.gitignore` containing `*`; dist/ is committed on purpose.
  rm -f "dist/$outdir/.gitignore"
  # Licences and README live at the repository root; four copies is just noise.
  rm -f "dist/$outdir/LICENSE-APACHE" "dist/$outdir/LICENSE-MIT" "dist/$outdir/README.md"
  # wasm-pack writes a full package manifest here, declaring the same name and
  # version as the real package and pointing main/types at the raw glue rather
  # than our wrapper. A nested manifest claiming to be js-vaporetto confuses
  # resolvers, so replace it with only what is actually needed.
  rm -f "dist/$outdir/package.json"

  before=$(wc -c < "dist/$outdir/js_vaporetto_bg.wasm" | tr -d ' ')
  "$WASM_OPT" "${WASM_OPT_ARGS[@]}" "dist/$outdir/js_vaporetto_bg.wasm" \
    -o "dist/$outdir/js_vaporetto_bg.wasm"
  after=$(wc -c < "dist/$outdir/js_vaporetto_bg.wasm" | tr -d ' ')
  echo "   wasm ${before} -> ${after} bytes"
done

# --- deno: tolerate a wrong Content-Type -------------------------------------
# wasm-pack's deno target calls WebAssembly.instantiateStreaming(fetch(url))
# with no fallback, and instantiateStreaming rejects anything not served as
# application/wasm. raw.githubusercontent.com — the import URL this project
# documents — serves .wasm as application/octet-stream, so the generated glue
# fails there with "Invalid WebAssembly content type". The web target already
# has this fallback; the deno target does not, so patch it in.
python3 - "dist/deno/js_vaporetto.js" <<'PATCH'
import sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
old = ("const wasmInstantiated = await WebAssembly.instantiateStreaming"
       "(fetch(wasmUrl), __wbg_get_imports());")
new = """const wasmResponse = await fetch(wasmUrl);
// instantiateStreaming requires `application/wasm`; raw.githubusercontent.com
// and other static hosts serve .wasm as application/octet-stream. Patched in
// by scripts/build.sh — wasm-pack's deno target ships no fallback.
const wasmInstantiated = wasmResponse.headers.get("content-type") === "application/wasm"
    ? await WebAssembly.instantiateStreaming(wasmResponse, __wbg_get_imports())
    : await WebAssembly.instantiate(await wasmResponse.arrayBuffer(), __wbg_get_imports());"""
if old not in src:
    if "wasmResponse" in src:
        sys.exit(0)  # already patched
    sys.exit("deno glue does not contain the expected instantiateStreaming call")
open(path, "w", encoding="utf-8").write(src.replace(old, new, 1))
PATCH

# --- entry wrappers ----------------------------------------------------------
VERSION_BLOCK_ESM="export const VAPORETTO_VERSION = \"$VAPORETTO_VERSION\";
export const JS_VAPORETTO_VERSION = \"$JS_VERSION\";"

# wasm-bindgen's generated free() calls into wasm unconditionally, so calling it
# twice throws "null pointer passed to rust". A disposable is expected to be
# safe to dispose more than once — otherwise mixing `using` with an explicit
# free() inside the same scope blows up at scope exit. Guard on the pointer
# field wasm-bindgen stores on the instance. If a future wasm-bindgen renames
# that field the comparison is against undefined, which simply restores the
# original unguarded behaviour rather than breaking anything.
IDEMPOTENT_FREE='const __free = Vaporetto.prototype.free;
Vaporetto.prototype.free = function free() {
  if (this.__wbg_ptr !== 0) __free.call(this);
};
if (typeof Symbol.dispose === "symbol") {
  Vaporetto.prototype[Symbol.dispose] = Vaporetto.prototype.free;
}'

# The generated declarations use [Symbol.dispose], which needs the
# esnext.disposable lib. Reference it so consumers whose tsconfig targets an
# older lib do not get TS2550 just from importing the package.
DTS_LIB_REF='/// <reference lib="esnext.disposable" />'

VERSION_DTS="export declare const VAPORETTO_VERSION: string;
export declare const JS_VAPORETTO_VERSION: string;"

# The third argument is where the generated glue lives relative to the wrapper.
# Every wasm-pack target keeps it alongside; the workers target reuses the web
# target's, one directory over.
write_wrapper() {
  local target="$1" body="$2" glue="${3:-./js_vaporetto.js}"
  printf '%s\n' "$body" > "dist/$target/vaporetto.js"
  {
    printf '%s\n' "$DTS_LIB_REF"
    printf 'export * from "%s";\n' "$glue"
    printf '%s\n' "$VERSION_DTS"
  } > "dist/$target/vaporetto.d.ts"
}

# bundler / deno: the glue initializes the wasm module itself, so a plain
# re-export is enough.
for target in bundler deno; do
  write_wrapper "$target" "// Generated by scripts/build.sh — do not edit.
import { Vaporetto } from \"./js_vaporetto.js\";
export * from \"./js_vaporetto.js\";

$IDEMPOTENT_FREE

$VERSION_BLOCK_ESM"
done

# web: callers must await the default export before using Vaporetto, so the
# default and initSync have to be re-exported explicitly (\`export *\` skips
# the default export).
write_wrapper web "// Generated by scripts/build.sh — do not edit.
import { Vaporetto } from \"./js_vaporetto.js\";
export * from \"./js_vaporetto.js\";
export { default, initSync } from \"./js_vaporetto.js\";

$IDEMPOTENT_FREE

$VERSION_BLOCK_ESM"
{
  printf '%s\n' "$DTS_LIB_REF"
  printf 'export * from "./js_vaporetto.js";\n'
  printf 'export { default, initSync } from "./js_vaporetto.js";\n'
  printf '%s\n' "$VERSION_DTS"
} > dist/web/vaporetto.d.ts

# workers: Cloudflare Workers (workerd) has no filesystem and cannot fetch a
# relative URL, so neither the node nor the web/deno initialization path works.
# What it does have is Wrangler compiling an imported .wasm into a
# WebAssembly.Module at deploy time — exactly what initSync() takes. So this
# entry is the web glue plus an eager initSync, which keeps the public API
# synchronous and identical to every other target.
#
# It reuses dist/web/ rather than getting its own wasm-pack run: the glue is
# byte for byte what `--target web` produces, and a fifth copy of the .wasm
# would add ~310 KB to a repository that commits dist/.
#
# The bundler target is what Wrangler would otherwise resolve (via the
# "browser" condition), and it does not work: its `import * as wasm from
# "./js_vaporetto_bg.wasm"` expects the ESM-integration shape where the import
# yields instantiated exports, so on workerd it fails at startup with
# "wasm2.__wbindgen_start is not a function".
# This is the one target wasm-pack does not build, so it needs its own directory
# rather than a turn through the TARGETS loop.
rm -rf dist/workers
mkdir -p dist/workers
write_wrapper workers "// Generated by scripts/build.sh — do not edit.
import wasmModule from \"../web/js_vaporetto_bg.wasm\";
import { Vaporetto, initSync } from \"../web/js_vaporetto.js\";
export * from \"../web/js_vaporetto.js\";

// Instantiating a 310 KB module costs well under a millisecond, so doing it at
// module scope stays inside the Workers startup CPU budget. Loading a model is
// the expensive part, and that is the caller's call to make in a request.
initSync({ module: wasmModule });

$IDEMPOTENT_FREE

$VERSION_BLOCK_ESM" "../web/js_vaporetto.js"

# node: wasm-pack emits CommonJS here (dist/node/package.json has no "type",
# which pins the directory to CommonJS even though the root package is ESM).
# Each export is assigned individually so Node's cjs-module-lexer can see the
# named exports and `import { Vaporetto } from "js-vaporetto"` works from ESM.
cat > dist/node/vaporetto.js <<EOF
// Generated by scripts/build.sh — do not edit.
const { Vaporetto } = require("./js_vaporetto.js");

$IDEMPOTENT_FREE

exports.Vaporetto = Vaporetto;
exports.VAPORETTO_VERSION = "$VAPORETTO_VERSION";
exports.JS_VAPORETTO_VERSION = "$JS_VERSION";
EOF
{
  printf '%s\n' "$DTS_LIB_REF"
  printf 'export * from "./js_vaporetto.js";\n'
  printf '%s\n' "$VERSION_DTS"
} > dist/node/vaporetto.d.ts

# dist/node must stay CommonJS even though the root package is ESM. A manifest
# without a "type" field is what pins it; nothing else here is needed. The
# other targets inherit "type": "module" from the root package, and their
# side effects are declared in the root manifest, so they get no manifest.
printf '{\n  "//": "Pins this directory to CommonJS; the root package is ESM."\n}\n' \
  > dist/node/package.json

# --- aggregated types --------------------------------------------------------
# The generated .d.ts is identical for bundler/node/deno; web additionally
# declares the async init. The package-level "types" entry uses the common one.
mkdir -p dist/types
{
  printf '%s\n' "$DTS_LIB_REF"
  printf '// Generated by scripts/build.sh — do not edit.\n'
  sed -e '/^\/\* tslint:disable \*\/$/d' -e '/^\/\* eslint-disable \*\/$/d' \
      dist/bundler/js_vaporetto.d.ts
  printf '\n%s\n' "$VERSION_DTS"
} > dist/types/index.d.ts

# --- build manifest -----------------------------------------------------------
# The .wasm is NOT byte-reproducible across host operating systems: the same
# rustc 1.95.0 emits 316,903 bytes on macOS and 316,505 on Linux, while every
# generated .js and .d.ts is identical. So CI cannot diff the whole of dist/.
# Instead, record a hash of every input that affects the output. CI reruns this
# script and diffs dist/ excluding the .wasm — if a source changed without a
# rebuild, BUILD_INFO no longer matches and the check fails, which is the
# failure this guards against. Tool versions are included because they change
# the output too, and none of these strings differ by platform.
# Hash the CR-stripped content, and strip CR from the whole file, so the
# manifest does not depend on how a checkout handled line endings or on
# Windows tools printing CRLF. On an LF checkout this is the identity.
sha_stdin() { if command -v sha256sum > /dev/null; then sha256sum; else shasum -a 256; fi; }
hash_of() { tr -d '\r' < "$1" | sha_stdin | cut -d' ' -f1; }
{
  printf '# Generated by scripts/build.sh — do not edit.\n'
  printf '# Inputs that produced the artifacts in this directory.\n\n'
  rustc --version
  wasm-pack --version
  "$WASM_OPT" --version
  printf 'wasm-opt args %s\n' "${WASM_OPT_ARGS[*]}"
  printf '\n'
  for f in src/lib.rs Cargo.toml Cargo.lock rust-toolchain.toml scripts/build.sh; do
    printf '%s  %s\n' "$(hash_of "$f")" "$f"
  done
} | tr -d '\r' > dist/BUILD_INFO
echo "wrote dist/BUILD_INFO"

echo
echo "== dist =="
find dist -type f | sort | while read -r f; do printf '%10s  %s\n' "$(wc -c < "$f" | tr -d ' ')" "$f"; done
