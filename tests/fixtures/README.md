# Test fixtures

## `corpus.tok` — training corpus

An **original composition written for this project**. It is not derived from any
existing corpus and is covered by the same `MIT OR Apache-2.0` dual license as
the rest of this repository.

It deliberately does *not* copy the fixture from python-vaporetto or from
`vaporetto/resources/docs.tok`.

Format is Vaporetto's tokenized-corpus format: tokens separated by a single
half-width space, tags appended after `/`. Here the tags are
`surface/part-of-speech/reading`.

Every line exists for a specific test. Do not "clean up" the corpus without
re-checking the expectations below.

| line | purpose |
|---|---|
| 1, 2 | `ところ` carries **two different parts of speech** (`名詞` in line 1, `助詞` in line 2). Vaporetto trains a tag *classifier* only for surfaces with more than one candidate tag; every other surface gets a fixed tag with empty weights. Without this ambiguity the tag-prediction path is never exercised. |
| 2 | `今 深海 魚` — three adjacent kanji tokens, so `wsConst: "K"` is observable. |
| 2 | `数え た ところ だ` — adjacent hiragana tokens, so `wsConst: "H"` is observable. |
| 3 | hiragana/kanji mixed tokens, keeps the character-type n-grams non-degenerate. |
| 4 | `1 2` — adjacent digit tokens, so `wsConst: "D"` is observable. |
| 5 | `A B` — adjacent latin tokens, so `wsConst: "R"` is observable. |
| 6 | `ア イ` — adjacent katakana tokens, so `wsConst: "T"` is observable. |
| 7 | `＊ ＃` — adjacent "other" tokens, so `wsConst: "O"` is observable. |

`wsConst: "G"` needs no corpus support: the model splits combining marks and
emoji sequences into individual code points by default, and
`ConcatGraphemeClustersFilter` rejoins them.

Lines 4-7 use full-width forms where the trainer would normalize to them anyway
(`train` applies `KyteaFullwidthFilter` unless `--no-norm` is given), so
inference with the default `normalize: true` sees the same forms.

The trainer rejects empty lines, so the file must not end with a blank line.

## `tiny.model` / `tiny.model.zst` — trained model

| file | bytes |
|---|---:|
| `tiny.model.zst` | 591 |
| `tiny.model` | 1058 |

`train` always writes zstd-compressed output (level 19, hardcoded). The
uncompressed `tiny.model` is produced by decompressing it, and is what
`Vaporetto.fromModel()` takes. `tiny.model.zst` is what
`Vaporetto.fromCompressedModel()` takes.

Regenerate both with:

```sh
./tests/fixtures/train.sh
```

The script clones `daac-tools/vaporetto` into `tmp/`, builds its `train` binary
and runs it. The `train` CLI is **not** part of the `vaporetto` crate published
on crates.io (that crate ships a library only), so the repository checkout is
required. Building it pulls in `liblinear`, which compiles C sources via the
`cc` crate — verified working on macOS aarch64 and on Linux.

Output is not byte-reproducible across vaporetto revisions (tag models are
stored in `BTreeMap` iteration order, which has changed upstream). Assert on
**tokenization results**, never on model bytes.

### Expected behaviour of this model

Default (`wsConst: ""`):

```
ここは静かなところだ       -> ここ は 静か な ところ だ
今深海魚を数えたところだ   -> 今 深海 魚 を 数え た ところ だ
青い空を鳥が飛ぶ           -> 青い 空 を 鳥 が 飛ぶ
12は数字だ                 -> 1 2 は 数字 だ
ABは英字だ                 -> A B は 英字 だ
アイは片仮名だ             -> ア イ は 片仮名 だ
＊＃は記号だ               -> ＊ ＃ は 記号 だ
```

Each `wsConst` character merges exactly its own character type:

```
D  12は数字だ               -> 12 は 数字 だ
R  ABは英字だ               -> AB は 英字 だ
H  今深海魚を数えたところだ -> 今 深海 魚 を 数えたところだ
T  アイは片仮名だ           -> アイ は 片仮名 だ
K  今深海魚を数えたところだ -> 今深海魚 を 数え た ところ だ
O  ＊＃は記号だ             -> ＊＃ は 記号 だ
G  "\u304B\u3099"           -> ["が"]   (default: ["か", "゙"])
```

`predictTags: true`:

```
ここは静かなところだ       -> ここ/代名詞/ココ は/助詞/ワ 静か/形容動詞/シズカ な/助動詞/ナ ところ/名詞/トコロ だ/助動詞/ダ
今深海魚を数えたところだ   -> 今/名詞/イマ 深海/名詞/シンカイ 魚/名詞/ギョ を/助詞/オ 数え/動詞/カゾエ た/助動詞/タ ところ/助詞/トコロ だ/助動詞/ダ
```

Note that `ところ` is tagged `名詞` in the first sentence and `助詞` in the
second — the tag classifier is genuinely running, not returning a fixed tag.

## Models that are deliberately absent

Distributed models such as `bccwj-suw+unidic_pos+pron` carry their own license
terms and are **not** committed here. Tests that need a realistic model download
it in CI.
