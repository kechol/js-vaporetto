# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Cloudflare Workers support (#2). A fifth target, `dist/workers`, is
  reached through a new `workerd` export condition and a
  `js-vaporetto/workers` subpath. It reuses the `web` glue and `.wasm` and
  initializes on import, so `import { Vaporetto } from "js-vaporetto"`
  works in a Worker with no plugin and nothing to await. Without it
  Wrangler fell through to the `browser` condition and the `bundler`
  target, which fails at startup with
  `wasm2.__wbindgen_start is not a function`.
- `npm run test:workers`: the shared suite (160 cases) on workerd via
  `wrangler dev --local`. Runs in CI, as does a check that the packed
  tarball works from `node_modules` inside a Worker.
- `npm run test:exports`: every export condition resolves to the target it
  is meant to. Nothing checked this before — the other tests import
  `dist/<target>` by relative path — so a wrong condition would only have
  surfaced as a runtime failure in whichever runtime it misrouted.

## [0.1.0] - 2026-07-26

Initial release.

### Added

- WebAssembly bindings for Vaporetto 0.6.5, built for four targets:
  bundler, web, Node.js and Deno. `dist/` is committed, so the package
  installs straight from GitHub without a build step.
- `Vaporetto.fromModel`, `fromKyteaModel` and `fromCompressedModel`
  (zstd, decompressed in Rust via `ruzstd`).
- `tokenize`, `tokenizeToString` and `tokenizeBatch`. Tokens come back as
  plain objects rather than wasm-backed class instances, so releasing them
  does not depend on `FinalizationRegistry`.
- `VaporettoOptions`: `predictTags`, `wsConst` and `normalize`.
- Token offsets in **UTF-16 code units**, so
  `text.slice(token.start, token.end) === token.surface` holds in
  JavaScript. Vaporetto itself reports code point indices. Covered by
  tests for surrogate pairs, combining marks, ZWJ emoji sequences,
  regional indicator pairs, skin tone modifiers and conjoining jamo, at
  the start, middle and end of a sentence, with and without
  normalization.
- `free()` and `[Symbol.dispose]()`, both idempotent, so `using`
  composes safely with an explicit `free()`. The library itself never
  uses `using`, so it runs as far back as Node 20.
- Hand-written TypeScript declarations, so no part of the public API is
  typed `any` or `JsValue`.
- `VAPORETTO_VERSION` and `JS_VAPORETTO_VERSION` as plain constants.
- The Deno raw-URL import works against hosts that do not serve `.wasm`
  as `application/wasm`, which includes `raw.githubusercontent.com` —
  the URL this project documents.
- Input validation on every entry point: malformed model bytes, a NUL
  character in the text, an unrecognized `wsConst` character and a
  non-array argument to `tokenizeBatch` all raise catchable errors and
  leave the tokenizer usable.
- A test model trained from an original corpus committed in
  `tests/fixtures/`, with the training script and the rationale for every
  line of the corpus.
- Benchmark harness, including a comparison against the official
  python-vaporetto.

### Security

- `fromCompressedModel` caps decompression at 256 MiB, so a crafted or
  corrupt zstd buffer fails with a clear error rather than exhausting
  memory. The largest distributed model is ~56 MB uncompressed.
- Because `dist/` ships prebuilt binaries, how they were produced matters:
  the toolchain installer verifies a recorded sha256 for every archive it
  downloads and refuses any platform with no recorded hash, and every
  third-party GitHub Action is pinned to a commit SHA rather than a tag.

### Notes

- `charwise-pma` is off by default. It costs 8.6% more wasm and roughly
  doubles model load time for a 5-8% tokenization gain; break-even is
  around 45 million characters per model load. Enable it with
  `--features charwise-pma` for a long-lived server process.
- `tokenizeBatch` is not faster than calling `tokenize` in a loop. The
  cost is building the token objects, which batching cannot avoid. It is
  kept for API compatibility; see the README benchmarks.
- Vaporetto's pointwise prediction does not guarantee that the same
  phrase always segments the same way, which makes it a poor fit for
  full-text search indexing. See the README.
- A deliberately crafted model buffer can panic inside the upstream
  `vaporetto` deserializer, surfacing as `WebAssembly.RuntimeError`
  rather than a descriptive error. It is catchable and the module stays
  usable, but model files should be treated as trusted input.

[Unreleased]: https://github.com/kechol/js-vaporetto/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kechol/js-vaporetto/releases/tag/v0.1.0
