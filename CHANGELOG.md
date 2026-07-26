# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  composes safely with an explicit `free()`.
- Hand-written TypeScript declarations, so no part of the public API is
  typed `any` or `JsValue`.
- `VAPORETTO_VERSION` and `JS_VAPORETTO_VERSION` as plain constants.
- A test model trained from an original corpus committed in
  `tests/fixtures/`, with the training script and the rationale for every
  line of the corpus.
- Benchmark harness, including a comparison against the official
  python-vaporetto.

### Fixed

- `tokenizeBatch` now rejects a non-array argument instead of silently
  mis-tokenizing it. Passing `null` or `undefined` previously threw from
  inside the wasm-bindgen borrow guard, which then stayed stuck: every
  later call on that tokenizer, including `free()`, failed permanently
  and leaked its wasm memory.
- `fromCompressedModel` caps decompression at 256 MiB, so a crafted or
  corrupt zstd buffer fails with a clear error instead of exhausting
  memory.

### Removed

- The internal `__vaporettoVersion()` / `__jsVaporettoVersion()` wasm
  exports. Nothing called them — the build reads the versions from
  `Cargo.toml` — and they showed up in the published type declarations.

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

[Unreleased]: https://github.com/kechol/js-vaporetto/commits/main
