# js-vaporetto

*[日本語版 README](README.ja.md)*

WebAssembly bindings for [Vaporetto](https://github.com/daac-tools/vaporetto), a
fast pointwise-prediction Japanese tokenizer, for browsers, Node.js, Deno and Bun.

> **This is an unofficial, community-maintained binding. It is not affiliated
> with or endorsed by daac-tools.**
>
> The repository name follows the naming convention of the official
> [`python-vaporetto`](https://github.com/daac-tools/python-vaporetto), but this
> project is maintained independently and has no connection to the Vaporetto
> authors. Please do not report js-vaporetto issues to the upstream repository.

Built against **Vaporetto 0.6.5**, used as a crates.io dependency — the upstream
source is not vendored here. The exact version is available at runtime as
`VAPORETTO_VERSION`.

```ts
import { Vaporetto } from "js-vaporetto";

const tokenizer = Vaporetto.fromModel(modelBytes);

tokenizer.tokenizeToString("今深海魚を数えたところだ");
// "今 深海 魚 を 数え た ところ だ"

tokenizer.tokenize("今深海魚を数えたところだ");
// [{ surface: "今", start: 0, end: 1, tags: [] }, ...]

tokenizer.free();
```

On an engine with explicit resource management you can let the scope do it —
see [Errors and lifetime](#errors-and-lifetime):

```ts
using tokenizer = Vaporetto.fromModel(modelBytes);
```

## Read this before you build anything on it

**Vaporetto's pointwise-prediction word segmentation can produce different
segmentations depending on surrounding context, so it does not guarantee that
the same phrase is always split the same way.** It may be unsuitable for
full-text search indexing and similar uses where segmentation has to be
consistent. This is a property of the algorithm and cannot be fixed in a
binding. (The same caveat is documented by
[sqlite-vaporetto](https://github.com/hotchpotch/sqlite-vaporetto).)

You can see it in the bundled fixture model: `ところ` is tagged `名詞` in
`ここは静かなところだ` and `助詞` in `今深海魚を数えたところだ`.

## Is Vaporetto the right tokenizer for you?

Japanese tokenizers fall into three algorithmic families, and they are good at
different things.

| family | how it works | examples |
|---|---|---|
| minimum cost (Viterbi / lattice) | enumerate candidates from a dictionary, find the lowest-cost path | MeCab, Vibrato, Lindera, Sudachi, Kuromoji |
| **pointwise** | classify each character boundary independently | KyTea, **Vaporetto** |
| longest match | match learned patterns left to right, deterministically | Jagger |
| neural | sequence labelling / foundation models | Juman++, KWJA, nagisa |

Vaporetto is pointwise. The distinguishing consequence is that **it needs a model
but no dictionary**, and that is what makes it viable in a browser.

### Why this exists

For a browser or edge runtime, size decides everything. Measured on
2026-07-26:

| | size |
|---|---:|
| js-vaporetto engine (`dist/web`, one target) | **316 KB** (127 KB gzipped) |
| smallest Vaporetto model, `bccwj-suw_c0.003` | **8.9 KB** compressed |
| Vaporetto model with POS + reading tags | 6.0 MB compressed |
| `lindera-wasm-web-ipadic@2.0.0`, unpacked | 13.1 MB |
| `lindera-wasm-web@4.0.1`, unpacked (dictionary separate) | 1.9 MB |

Lindera does ship a wasm build, but the dictionary is large enough that it is
published as separate packages per dictionary and target. Vibrato's dictionaries
run to hundreds of megabytes. Jagger has no wasm precedent that we could find
and is distributed under a triple licence from a university site rather than a
package registry.

Engine plus smallest model, js-vaporetto is around 325 KB — roughly a fortieth
of the Lindera equivalent. **For a Japanese tokenizer that actually runs in a
browser, Vaporetto is close to the only practical option**, and that is the gap
this project fills.

### When to use something else

We would rather you pick the right tool than pick ours.

| what you are doing | use | why |
|---|---|---|
| **Full-text search indexing** | **Sudachi** or **Lindera** | Segmentation has to be consistent. Vaporetto's is not — see the warning above. Sudachi also normalizes orthographic variants and offers A/B/C split granularity. |
| Embedding in a Rust search engine | **Lindera** | The de-facto choice; Meilisearch, Quickwit and Tantivy build on it. |
| Migrating from MeCab | **Vibrato** | MeCab-compatible output, and existing IPADIC / UniDic dictionaries work unchanged. |
| Bulk preprocessing where throughput dominates | **Jagger** | Reported at several times Vaporetto's speed. Check the licence and its tendency toward long morphemes. |
| Maximum accuracy, research | **Juman++** / **KWJA** | Slower, but that is not the constraint there. |
| Python, server side | **fugashi** / **SudachiPy** | Wheels are prebuilt; nothing to compile. Note that the original SudachiPy was archived in 2022 and the current package is a binding to the Rust `sudachi.rs`. |
| **Browser, wasm, edge** | **js-vaporetto** | Small model, light dependencies. |
| Node.js server with no size constraint | **Lindera** (`lindera-nodejs`) | Native bindings, no wasm overhead, consistent segmentation. |

For scale, crates.io downloads over the 90 days to 2026-07-26: lindera 558,129,
vaporetto 55,993, crawdad 14,244, vibrato 13,259. Lindera is where the Rust
ecosystem is; Vaporetto is where the size-constrained deployments are — its
reverse dependencies include `qdrant-edge` (the edge build of the Qdrant vector
database), `vaporetto_tantivy` and
[sqlite-vaporetto](https://github.com/hotchpotch/sqlite-vaporetto).

Sizes and download counts above were measured against the npm and crates.io APIs
on the date given. Comparative accuracy and speed claims for other tokenizers
are from their own documentation and papers; only the js-vaporetto numbers in
this README were measured here.

## Install

This package is **not published to npm**. Install it from GitHub, or import it
directly from a tagged raw URL.

### Node.js / Bun

```sh
npm i github:kechol/js-vaporetto#v0.1.0
# or
bun add github:kechol/js-vaporetto#v0.1.0
```

```js
import { Vaporetto } from "js-vaporetto";
import { readFileSync } from "node:fs";

const tokenizer = Vaporetto.fromModel(readFileSync("./bccwj-suw+unidic_pos+pron.model"));
console.log(tokenizer.tokenizeToString("今深海魚を数えたところだ"));
tokenizer.free();
```

### Deno

```ts
import { Vaporetto } from "https://raw.githubusercontent.com/kechol/js-vaporetto/v0.1.0/dist/deno/vaporetto.js";

const model = await Deno.readFile("./bccwj-suw+unidic_pos+pron.model");
using tokenizer = Vaporetto.fromModel(model); // Deno 2 supports `using`
console.log(tokenizer.tokenizeToString("今深海魚を数えたところだ"));
```

```sh
deno run --allow-read --allow-net=raw.githubusercontent.com main.ts
```

`--allow-net` is required in addition to the import. `raw.githubusercontent.com`
is already in Deno's default `--allow-import` list, but the generated glue
fetches the `.wasm` over the network at module load, and that needs `--allow-net`.

### Browser

```html
<script type="module">
  import init, { Vaporetto } from "https://raw.githubusercontent.com/kechol/js-vaporetto/v0.1.0/dist/web/vaporetto.js";

  await init(); // required: the web target initializes the wasm module asynchronously
  const model = new Uint8Array(await (await fetch("/model.zst")).arrayBuffer());
  const tokenizer = Vaporetto.fromCompressedModel(model);
  console.log(tokenizer.tokenizeToString("今深海魚を数えたところだ"));
  tokenizer.free();
</script>
```

A zip of the `web` target is attached to every
[release](https://github.com/kechol/js-vaporetto/releases) if you would rather
self-host it.

### Vite

The default export condition resolves to the `bundler` target, which imports the
`.wasm` with a bare ESM import. **Vite 7 cannot handle that on its own** — the
build fails regardless of `optimizeDeps`:

```
[vite:wasm-fallback] Could not load .../js_vaporetto_bg.wasm: "ESM integration
proposal for Wasm" is not supported currently. Use vite-plugin-wasm or other
community plugins to handle this.
```

Two options, both verified end to end (built with Vite 7.3.6 and executed in
Chromium):

**Use the `web` target — no extra plugins.** Recommended.

```js
import init, { Vaporetto } from "js-vaporetto/web";

await init(); // the web target initializes the wasm module asynchronously
const tokenizer = Vaporetto.fromModel(modelBytes);
```

Vite emits the `.wasm` as a normal asset (316 KB, 129 KB gzipped) and no config
change is needed.

**Or keep the default target and add `vite-plugin-wasm`.**

```js
// vite.config.js
import wasm from "vite-plugin-wasm";

export default {
  plugins: [wasm()],
  optimizeDeps: { exclude: ["js-vaporetto"] },
};
```

`optimizeDeps.exclude` keeps esbuild's dependency pre-bundling away from the
package; the plugin is what actually makes the build succeed. Do **not** also
add `vite-plugin-top-level-await` — with Vite's default esbuild target it fails
with `Transforming destructuring to the configured target environment ... is not
supported yet`. Put your own `await` inside an async function instead.

### Other bundlers

Only Vite has been verified. If your bundler cannot import the `.wasm` directly
— the same `bundler` target failure shown above — use the `web` target, which
fetches the `.wasm` itself and needs no bundler support. Reports for other
bundlers are welcome.

### Explicit subpaths

If the automatic condition picks the wrong target, import a subpath directly:

```js
import { Vaporetto } from "js-vaporetto/node";     // CommonJS, reads the .wasm from disk
import { Vaporetto } from "js-vaporetto/deno";     // ESM, fetches the .wasm
import init, { Vaporetto } from "js-vaporetto/web";     // ESM, async init required
import { Vaporetto } from "js-vaporetto/bundler";  // ESM, imports the .wasm
```

## Models are not bundled

js-vaporetto ships **no model**. Distributed models are derived from corpora with
their own licence terms, so they are not redistributed here.

Download one from
[daac-tools/vaporetto-models](https://github.com/daac-tools/vaporetto-models/releases):

| model | download | uncompressed | tags |
|---|---:|---:|---|
| `bccwj-suw+unidic_pos+pron` | 6.0 MB | 55.8 MB | part of speech + pronunciation |
| `bccwj-suw+unidic_pos+kana` | 6.1 MB | — | part of speech + kana |
| `bccwj-suw_c1.0` | 386 KB | — | none |
| `bccwj-suw_c0.003` | 8.7 KB | — | none (smallest) |

These are trained on BCCWJ and distributed under BSD-3-Clause; read the `BSD`
file inside each archive before shipping one.

You can also train your own — see
[`tests/fixtures/README.md`](tests/fixtures/README.md), which documents how the
1 KB test model in this repository was produced.

### Compressed models

The distributed models are zstd-compressed. Decompression happens in Rust via
[`ruzstd`](https://crates.io/crates/ruzstd), so you can hand the `.zst` bytes
straight in:

```js
Vaporetto.fromCompressedModel(zstBytes);  // .model.zst
Vaporetto.fromModel(rawBytes);            // .model
```

`fromCompressedModel` is behind a default-on Cargo feature (`zstd`). Building
without it removes 64 KB of wasm; see [Building](#building).

## API

```ts
export interface VaporettoOptions {
  /** Predict part-of-speech / reading tags. Default false. */
  predictTags?: boolean;
  /** Character classes not to segment: any combination of "D R H T K O G". Default "". */
  wsConst?: string;
  /** Normalize the input before prediction. Default true. */
  normalize?: boolean;
}

export interface Token {
  surface: string;
  /** Offset into the input string, in UTF-16 code units (inclusive). */
  start: number;
  /** Same (exclusive). */
  end: number;
  /** Empty array when predictTags is false. */
  tags: (string | null)[];
}

export class Vaporetto {
  static fromModel(model: Uint8Array, options?: VaporettoOptions): Vaporetto;
  static fromKyteaModel(model: Uint8Array, options?: Omit<VaporettoOptions, "predictTags">): Vaporetto;
  static fromCompressedModel(model: Uint8Array, options?: VaporettoOptions): Vaporetto;

  tokenize(text: string): Token[];
  tokenizeToString(text: string): string;
  tokenizeBatch(texts: string[]): Token[][];

  free(): void;
  [Symbol.dispose](): void;
}

export const VAPORETTO_VERSION: string;
export const JS_VAPORETTO_VERSION: string;
```

### Offsets are UTF-16 code units

Vaporetto reports token positions in Unicode code points. JavaScript's
`String.prototype.slice()` indexes UTF-16 code units. js-vaporetto converts at
the boundary, so this always holds:

```js
text.slice(token.start, token.end) === token.surface
```

It is covered by the test suite for surrogate pairs, combining marks, ZWJ emoji
sequences, regional indicator pairs, skin tone modifiers and conjoining jamo, at
the start, middle and end of a sentence, with and without normalization.

Note that by default the tokenizer may split *inside* a grapheme cluster — `か` +
U+3099 comes back as two tokens. Pass `wsConst: "G"` to keep grapheme clusters
together.

### Normalization

With `normalize: true` (the default) the input is passed through
`KyteaFullwidthFilter` before prediction, matching what the upstream `predict`
CLI does. Token surfaces and offsets always refer to your **original** string,
never the normalized one.

If you train your own model, note that `train` normalizes by default too, so
half-width input only matches a model trained on half-width text when you pass
`normalize: false` on both sides.

### `wsConst`

Each character prevents segmentation within one character class:

| char | class | example (fixture model) |
|---|---|---|
| `D` | digits | `12は数字だ` → `1 2 は 数字 だ` → `12 は 数字 だ` |
| `R` | latin | `ABは英字だ` → `A B は 英字 だ` → `AB は 英字 だ` |
| `H` | hiragana | `…数え た ところ だ` → `…数えたところだ` |
| `T` | katakana | `アイは片仮名だ` → `ア イ は…` → `アイ は…` |
| `K` | kanji | `今 深海 魚 を…` → `今深海魚 を…` |
| `O` | other | `＊＃は記号だ` → `＊ ＃ は…` → `＊＃ は…` |
| `G` | grapheme clusters | `か`+U+3099 → `か` `゙` → `が` |

Combine them freely, e.g. `wsConst: "DGR"`. An unrecognized character throws.

Unlike sqlite-vaporetto, js-vaporetto does **not** apply `SplitLinebreaksFilter`,
so tokens may span a newline. This matches the official python-vaporetto.

### Errors and lifetime

* Malformed model bytes throw a catchable `Error` — including an empty
  `Uint8Array`. The wasm module stays usable afterwards.
* A NUL character in the input throws. An empty string returns `[]` / `""`.
* Calling a method after `free()` throws `null pointer passed to rust` rather
  than crashing the module.
* `free()` and `[Symbol.dispose]()` are idempotent, so `using` composes safely
  with an explicit `free()`.
* The `using` *statement* is optional sugar and needs an engine with explicit
  resource management: Node 24+, Deno 2+, Bun 1.3+ or a current browser. **The
  library itself never uses it** — it only provides the `[Symbol.dispose]()`
  method, which exists as far back as Node 20. On older engines call `free()`,
  or `[Symbol.dispose]()`, directly; nothing else changes.
* `predictTags: true` against a model with no tag data returns empty `tags`
  rather than throwing, matching upstream Vaporetto. `fromKyteaModel` forces
  `predictTags` to false because KyTea models carry no tag data.

## Benchmarks

Apple M-series, macOS 25.5, Node 24.14.0. Model `bccwj-suw+unidic_pos+pron`
(55.8 MB uncompressed), input 2,000 lines / 342,395 characters / 224,724 tokens
from 『吾輩は猫である』 (public domain). Best of three runs. Reproduce with
`node bench/run.mjs --dist dist/node --model <model> --corpus <file>`.

### Per-call vs batched

| | time | throughput |
|---|---:|---:|
| `tokenize` per call | 121 ms | 2.8 M chars/s |
| `tokenizeBatch` (one call) | 130 ms | 2.6 M chars/s |
| `tokenizeToString` per call | 31 ms | 11.1 M chars/s |

**`tokenizeBatch` is not faster.** The premise it was added under — that the
UTF-16 to UTF-8 string copy at each call boundary dominates — does not hold
here. `tokenizeToString` does the same tokenization and the same input copy in a
quarter of the time, so the input crossing is cheap; the cost is building
224,724 plain token objects, which batching cannot avoid.

An earlier implementation that took `Vec<String>` was measurably *worse* (0.75×)
because wasm-bindgen materialized every input string in wasm memory up front.
The current implementation pulls one string across at a time, which brings it to
0.92–1.04× of per-call. It is kept for API compatibility and because it edges
ahead when `predictTags` is on, but **reach for it only if you measure a win in
your own workload.**

### Against python-vaporetto

Same machine, same model, same input. python-vaporetto 0.6.5 (which also wraps
vaporetto 0.6.5), with token fields materialized so both do equal work.

| | python-vaporetto | js-vaporetto | |
|---|---:|---:|---|
| model load | 2,160 ms | **1,102 ms** | js 2.0× faster |
| `tokenize` | **44 ms** | 122 ms | python 2.8× faster |
| `tokenizeToString` | **17 ms** | 31 ms | python 1.8× faster |
| `tokenize` + tags | **117 ms** | 276 ms | python 2.4× faster |

js-vaporetto loads faster only because it builds without `charwise-pma` (see
below); python-vaporetto uses vaporetto's defaults. The tokenization gap is the
JS object marshalling — `tokenizeToString`, which crosses the boundary once with
a single string, is within 1.8×.

### `charwise-pma`

Vaporetto's `charwise-pma` feature swaps in daachorse's charwise automaton.
Upstream documents it as "faster prediction, although it can make loading a
model file slower". Measured here (three runs, alternating order):

| | wasm (`-Oz`) | model load | `tokenize` |
|---|---:|---:|---:|
| enabled | 343,698 B | 2,111–2,136 ms | 103–115 ms |
| **disabled (default)** | **316,465 B** | **1,038–1,133 ms** | 112–120 ms |

It costs 8.6 % more wasm and roughly doubles model load time (+1,050 ms), for a
tokenization gain of about 5–8 % — barely above run-to-run noise. Break-even is
around 45 million characters of throughput per model load, which no browser
session will reach, so **it is off by default**. Enable it with
`--features charwise-pma` if you run a long-lived server that tokenizes far more
than that per process.

## Verified runtimes

Only versions actually exercised are listed. Everything except the Vite row runs
in CI on every push; the Vite integration was verified manually (build plus a
Chromium run of the built output). Node 20 reached end of life upstream on
2026-04-30 — it is tested because `engines` claims it, not as a recommendation.

| runtime | version | export condition | target |
|---|---|---|---|
| Node.js | 20.x, 22.x, 24.x | `node` | `dist/node` (CommonJS). `using` needs 24+ |
| Deno | 2.x | `deno` | `dist/deno` |
| Bun | 1.3.x | `bun` | `dist/node` |
| Chromium | Playwright stable | — | `dist/web` |
| Firefox | Playwright stable | — | `dist/web` |
| Vite | 7.3.x | `browser` / `default` | `dist/bundler` (needs `vite-plugin-wasm`) or `dist/web` |

### Why `bun` points at the Node target

The `bun` condition was verified experimentally rather than assumed. Loading
`dist/bundler/vaporetto.js` under Bun 1.3.11 fails:

```
TypeError: wasm.__wbindgen_start is not a function.
  (In 'wasm.__wbindgen_start()', 'wasm.__wbindgen_start' is undefined)
```

Bun's direct `.wasm` import does not expose the module's exports in the shape the
bundler glue expects. `dist/node` works, so that is what the `bun` condition
resolves to. The check is part of the test suite (`bun test tests/bun.test.ts`).

One Bun quirk worth recording, since it looks alarming if you hit it: Bun's
*self-reference* resolution (a package importing itself by its own name) matches
the `types` condition and tries to execute `dist/types/index.d.ts`, producing a
confusing `SyntaxError`. Reordering the conditions does not change it. Normal
resolution through `node_modules` — what every consumer actually does — picks
`dist/node` correctly, so this only affects working inside this repository.
Import the target path directly there, as the tests do.

## Building

```sh
./scripts/setup-toolchain.sh   # pinned wasm-pack, wasm-bindgen-cli, binaryen
export PATH="$PWD/tmp/bin:$PATH"
./scripts/build.sh             # all four targets into dist/
npm test                       # Rust + Node + Deno + Bun + browser
```

Every tool version is pinned, for reasons worth knowing if you maintain a
similar project:

* **wasm-pack 0.15.0.** The repository moved from `drager/wasm-pack` to
  `wasm-bindgen/wasm-pack`; 0.14.0's npm package still points at the old release
  URL and 404s ([#1577](https://github.com/wasm-bindgen/wasm-pack/issues/1577)).
* **wasm-bindgen-cli must match the `wasm-bindgen` crate exactly** or the schema
  check fails. wasm-pack reads the version from `Cargo.lock`, which is why the
  lockfile is committed. wasm-pack 0.15.0 also cannot resolve a prebuilt
  wasm-bindgen for macOS aarch64 and falls back to a multi-minute
  `cargo install`; having the binary on `PATH` avoids that.
* **binaryen `version_131`.** wasm-pack 0.15.0 hardcodes `version_117` (released
  2024-02-28) and there is no way to override it from `Cargo.toml` — the only
  values accepted under `[package.metadata.wasm-pack.profile.release]` are a
  bool or an argument list. So `wasm-opt = false` is set there and `build.sh`
  runs a pinned `wasm-opt -Oz` itself.

Cargo features:

| feature | default | effect |
|---|---|---|
| `zstd` | on | `fromCompressedModel`. Costs ~64 KB of wasm. |
| `charwise-pma` | off | See [above](#charwise-pma). Costs ~27 KB. |
| `console_error_panic_hook` | off | Readable panic traces for debugging. Not for release builds. |

Releasing is `./scripts/bump-version.sh X.Y.Z` (it moves the version in
`Cargo.toml`, `Cargo.lock`, `package.json` and both READMEs' pinned install
URLs, then rebuilds `dist/`), a `CHANGELOG.md` entry, and a pushed `vX.Y.Z`
tag. `.github/workflows/release.yml` re-verifies all of that against the tag
before it publishes anything.

`dist/` is committed on purpose, since the package is installed straight from
GitHub. CI rebuilds it and fails if the result differs from what is committed.
The `.wasm` is byte-identical across all four targets, so `dist/` totals ~1.3 MB
on disk while git stores a single blob.

## Licence

Licensed under either of

* Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
* MIT licence ([LICENSE-MIT](LICENSE-MIT))

at your option.

## Acknowledgements

* [Vaporetto](https://github.com/daac-tools/vaporetto) by Koichi Akabe and
  contributors — the tokenizer this project wraps.
* [python-vaporetto](https://github.com/daac-tools/python-vaporetto) — the
  official binding. The approach of predicting on the normalized text and
  transferring only the resulting boundaries and tags back onto a `Sentence`
  built from the original text is adapted from it.
* [sqlite-vaporetto](https://github.com/hotchpotch/sqlite-vaporetto) by
  hotchpotch — a working example of calling Vaporetto 0.6.5. The `wsConst`
  character mapping and the shape of the offset reconstruction are adapted from
  it, and its README is the source of the segmentation-consistency caveat above.

See [NOTICE](NOTICE) for full attributions. Attribution is repeated inline at
each adapted function in the source.
