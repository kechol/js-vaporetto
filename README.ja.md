# js-vaporetto

*[English README](README.md)*

日本語トークナイザ [Vaporetto](https://github.com/daac-tools/vaporetto) の
WebAssembly バインディング。ブラウザ・Node.js・Deno・Bun で動きます。

> **これは非公式・コミュニティ実装のバインディングです。daac-tools とは無関係であり、
> 公認も受けていません。**
>
> リポジトリ名は公式の
> [`python-vaporetto`](https://github.com/daac-tools/python-vaporetto)
> の命名慣習に倣ったものですが、本プロジェクトは独立して管理されており、Vaporetto の
> 作者とは関係がありません。js-vaporetto の問題を上流リポジトリに報告しないでください。

**Vaporetto 0.6.5** に対してビルドしています。crates.io の依存として使っており、上流の
ソースはこのリポジトリに取り込んでいません。実際のバージョンは実行時に
`VAPORETTO_VERSION` で取得できます。

```ts
import { Vaporetto } from "js-vaporetto";

const tokenizer = Vaporetto.fromModel(modelBytes);

tokenizer.tokenizeToString("今深海魚を数えたところだ");
// "今 深海 魚 を 数え た ところ だ"

tokenizer.tokenize("今深海魚を数えたところだ");
// [{ surface: "今", start: 0, end: 1, tags: [] }, ...]

tokenizer.free();
```

明示的リソース管理に対応したエンジンなら、スコープに任せられます
（[エラーとライフタイム](#エラーとライフタイム) を参照）。

```ts
using tokenizer = Vaporetto.fromModel(modelBytes);
```

## 使う前に読んでほしいこと

**Vaporetto の点予測による単語分割は前後の文脈によって結果が変わるため、同じ語句が
常に同じ形に分割される保証はありません。** 全文検索のインデックスなど、分割の一貫性が
要求される用途には向きません。これは Vaporetto のアルゴリズム由来の性質で、
バインディング側では解決できません。
（[sqlite-vaporetto](https://github.com/hotchpotch/sqlite-vaporetto) の README も
同じ注意を促しています。）

同梱のテスト用モデルでも観察できます。`ところ` は `ここは静かなところだ` では `名詞`、
`今深海魚を数えたところだ` では `助詞` になります。

## Vaporetto を選ぶべきか

日本語トークナイザはアルゴリズムの系統が3つあり、それぞれ得意分野が違います。

| 系統 | 仕組み | 代表 |
|---|---|---|
| 最小コスト法（Viterbi / ラティス） | 辞書で単語候補を列挙し、連接コスト最小の経路を探す | MeCab, Vibrato, Lindera, Sudachi, Kuromoji |
| **点予測** | 文字間ごとに境界か否かを独立に分類 | KyTea, **Vaporetto** |
| 最長一致 | 学習済みパターンを先頭から決定的に切り出す | Jagger |
| ニューラル | 系列ラベリング / 基盤モデル | Juman++, KWJA, nagisa |

Vaporetto は点予測です。結果として **辞書が不要でモデルだけで動く** 点が決定的に違い、
これがブラウザで使える理由です。

### なぜこれが存在するのか

ブラウザやエッジではサイズが全てを決めます。2026-07-26 時点の実測値です。

| | サイズ |
|---|---:|
| js-vaporetto のエンジン（`dist/web` 1ターゲット） | **316 KB**（gzip 127 KB） |
| 最小の Vaporetto モデル `bccwj-suw_c0.003` | **8.9 KB**（圧縮時） |
| 品詞・読みタグ付きモデル | 6.0 MB（圧縮時） |
| `lindera-wasm-web-ipadic@2.0.0` 展開後 | 13.1 MB |
| `lindera-wasm-web@4.0.1` 展開後（辞書は別） | 1.9 MB |

Lindera にも wasm ビルドはありますが、辞書が大きいため辞書ごと・ターゲットごとに
別パッケージとして公開されています。Vibrato の辞書は数百 MB 規模でブラウザには載りません。
Jagger は wasm 化の前例が見当たらず、パッケージレジストリではなく大学サイトから
三重ライセンスで配布されています。

エンジン + 最小モデルで js-vaporetto は約 325 KB、Lindera 相当の 40 分の 1 程度です。
**ブラウザで実用的に動く日本語トークナイザという枠では Vaporetto がほぼ唯一の選択肢**で、
本プロジェクトはその穴を埋めるものです。

### 他を使うべきケース

うちを選んでもらうより、正しい道具を選んでもらうほうが大事です。

| やりたいこと | 推奨 | 理由 |
|---|---|---|
| **全文検索のインデックス** | **Sudachi** または **Lindera** | 分割の一貫性が要る。Vaporetto は揺れる（上記の注意参照）。Sudachi は表記ゆれ正規化と A/B/C の3段階分割も持つ |
| Rust の検索エンジンへの組み込み | **Lindera** | 事実上の標準。Meilisearch・Quickwit・Tantivy が採用 |
| MeCab からの移行 | **Vibrato** | MeCab 互換出力で、既存の IPADIC / UniDic 辞書がそのまま使える |
| スループット最優先の大量処理 | **Jagger** | Vaporetto の数倍の速度が報告されている。ライセンスと、形態素が長めに出る傾向は要確認 |
| 精度最優先・研究用途 | **Juman++** / **KWJA** | 遅いが、そこでは速度が制約にならない |
| Python でサーバサイド | **fugashi** / **SudachiPy** | wheel が整備されていてコンパイル不要。なお元の SudachiPy は 2022 年にアーカイブされ、現在のパッケージは Rust 実装 `sudachi.rs` のバインディング |
| **ブラウザ / wasm / エッジ** | **js-vaporetto** | モデルが小さく依存が軽い |
| サイズ制約のない Node.js サーバ | **Lindera**（`lindera-nodejs`） | ネイティブバインディングで wasm のオーバーヘッドがなく、分割も一貫する |

規模感として、2026-07-26 までの 90 日間の crates.io ダウンロード数は
lindera 558,129 / vaporetto 55,993 / crawdad 14,244 / vibrato 13,259 です。
Rust エコシステムの中心は Lindera で、Vaporetto はサイズ制約のある配置先で使われています。
逆依存には `qdrant-edge`（ベクトル DB Qdrant のエッジ版）、`vaporetto_tantivy`、
[sqlite-vaporetto](https://github.com/hotchpotch/sqlite-vaporetto) があります。

上記のサイズとダウンロード数は記載日に npm / crates.io の API に対して実測したものです。
他のトークナイザの精度・速度に関する比較は各プロジェクトのドキュメントや論文に基づきます。
この README で「実測」と書いてあるのは js-vaporetto の数値だけです。

## インストール

**npm には publish していません。** GitHub から入れるか、タグを固定した raw URL から
直接 import してください。

### Node.js / Bun

```sh
npm i github:kechol/js-vaporetto#v0.1.0
# または
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
using tokenizer = Vaporetto.fromModel(model); // Deno 2 は using に対応している
console.log(tokenizer.tokenizeToString("今深海魚を数えたところだ"));
```

```sh
deno run --allow-read --allow-net=raw.githubusercontent.com main.ts
```

import 許可とは別に `--allow-net` が必要です。`raw.githubusercontent.com` は Deno の
`--allow-import` 既定許可ホストに含まれますが、生成されたグルーコードがモジュール読み込み時に
`.wasm` を `fetch` で取得するため、そちらにネットワーク許可が要ります。

### ブラウザ

```html
<script type="module">
  import init, { Vaporetto } from "https://raw.githubusercontent.com/kechol/js-vaporetto/v0.1.0/dist/web/vaporetto.js";

  await init(); // 必須。web ターゲットは wasm を非同期に初期化する
  const model = new Uint8Array(await (await fetch("/model.zst")).arrayBuffer());
  const tokenizer = Vaporetto.fromCompressedModel(model);
  console.log(tokenizer.tokenizeToString("今深海魚を数えたところだ"));
  tokenizer.free();
</script>
```

自分でホストしたい場合は、各
[リリース](https://github.com/kechol/js-vaporetto/releases) に `web` ターゲット一式の
zip を添付しています。

### Vite

既定の export 条件は `bundler` ターゲットに解決され、これは `.wasm` を素の ESM import で
読み込みます。**Vite 7 はこれを単体で扱えません。** `optimizeDeps` の設定に関わらず
ビルドが失敗します。

```
[vite:wasm-fallback] Could not load .../js_vaporetto_bg.wasm: "ESM integration
proposal for Wasm" is not supported currently. Use vite-plugin-wasm or other
community plugins to handle this.
```

対処は 2 通りあり、どちらも Vite 7.3.6 でビルドして Chromium で実行するところまで
確認済みです。

**`web` ターゲットを使う（プラグイン不要）。** こちらを推奨します。

```js
import init, { Vaporetto } from "js-vaporetto/web";

await init(); // web ターゲットは wasm を非同期に初期化する
const tokenizer = Vaporetto.fromModel(modelBytes);
```

Vite は `.wasm` を通常のアセットとして出力し（316 KB、gzip 129 KB）、設定変更は要りません。

**または既定ターゲットのまま `vite-plugin-wasm` を入れる。**

```js
// vite.config.js
import wasm from "vite-plugin-wasm";

export default {
  plugins: [wasm()],
  optimizeDeps: { exclude: ["js-vaporetto"] },
};
```

`optimizeDeps.exclude` は esbuild の依存事前バンドルをこのパッケージから遠ざけるためのもので、
ビルドを成功させているのはプラグインのほうです。`vite-plugin-top-level-await` を追加で
入れないでください。Vite 既定の esbuild ターゲットでは
`Transforming destructuring to the configured target environment ... is not supported yet`
で失敗します。自前の `await` は async 関数の中に置いてください。

### その他のバンドラ

検証したのは Vite だけです。バンドラが `.wasm` を直接 import できない場合
（上記と同じ `bundler` ターゲットの失敗）、`web` ターゲットを使ってください。
こちらは自分で `.wasm` を fetch するのでバンドラ側の対応が要りません。
他のバンドラでの報告は歓迎します。

### サブパスの明示指定

自動で選ばれる条件が意図と違う場合は、サブパスを直接指定できます。

```js
import { Vaporetto } from "js-vaporetto/node";     // CommonJS、.wasm をディスクから読む
import { Vaporetto } from "js-vaporetto/deno";     // ESM、.wasm を fetch
import init, { Vaporetto } from "js-vaporetto/web";     // ESM、init の await が必要
import { Vaporetto } from "js-vaporetto/bundler";  // ESM、.wasm を import
```

## モデルは同梱していません

js-vaporetto は **モデルを一切含みません**。配布モデルはライセンス条項のあるコーパスから
作られているため、ここでは再配布していません。

[daac-tools/vaporetto-models](https://github.com/daac-tools/vaporetto-models/releases)
から取得してください。

| モデル | ダウンロード | 非圧縮 | タグ |
|---|---:|---:|---|
| `bccwj-suw+unidic_pos+pron` | 6.0 MB | 55.8 MB | 品詞 + 発音 |
| `bccwj-suw+unidic_pos+kana` | 6.1 MB | — | 品詞 + カナ |
| `bccwj-suw_c1.0` | 386 KB | — | なし |
| `bccwj-suw_c0.003` | 8.7 KB | — | なし（最小） |

いずれも BCCWJ で訓練され BSD-3-Clause で配布されています。配布物に載せる前に、
各アーカイブ内の `BSD` ファイルを確認してください。

自分で訓練することもできます。このリポジトリの 1 KB のテストモデルをどう作ったかは
[`tests/fixtures/README.md`](tests/fixtures/README.md) に書いてあります。

### 圧縮モデル

配布モデルは zstd 圧縮されています。解凍は
[`ruzstd`](https://crates.io/crates/ruzstd) で Rust 側が行うので、`.zst` のバイト列を
そのまま渡せます。

```js
Vaporetto.fromCompressedModel(zstBytes);  // .model.zst
Vaporetto.fromModel(rawBytes);            // .model
```

`fromCompressedModel` は既定で有効な Cargo feature（`zstd`）の下にあります。無効にすると
wasm が 64 KB 減ります。[ビルド](#ビルド) を参照してください。

## API

```ts
export interface VaporettoOptions {
  /** 品詞・読みなどのタグを予測する。既定 false */
  predictTags?: boolean;
  /** 指定した文字種を分割しない。"D"|"R"|"H"|"T"|"K"|"O"|"G" の組み合わせ（例 "DGR"）。既定 "" */
  wsConst?: string;
  /** 入力を事前に正規化する。既定 true */
  normalize?: boolean;
}

export interface Token {
  surface: string;
  /** 入力文字列における UTF-16 コード単位のオフセット（開始・含む） */
  start: number;
  /** 同（終了・含まない） */
  end: number;
  /** predictTags が false のときは空配列 */
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

### オフセットは UTF-16 コード単位

Vaporetto はトークン位置を Unicode コードポイント単位で返します。JavaScript の
`String.prototype.slice()` は UTF-16 コード単位で索引します。js-vaporetto は境界で
変換するので、次が常に成り立ちます。

```js
text.slice(token.start, token.end) === token.surface
```

サロゲートペア・結合文字・ZWJ 絵文字シーケンス・地域指示子ペア・肌色修飾子・
ハングル字母について、文頭・文中・文末それぞれで、正規化の有無を変えてテストしています。

なお既定では書記素クラスタの**内側**で分割されることがあります。`か` + U+3099 は
2 トークンで返ります。まとめたい場合は `wsConst: "G"` を指定してください。

### 正規化

`normalize: true`（既定）では、予測の前に入力を `KyteaFullwidthFilter` に通します。
上流の `predict` CLI と同じ挙動です。トークンの表層とオフセットは常に**元の文字列**を
指し、正規化後の文字列を指すことはありません。

自分でモデルを訓練する場合、`train` も既定で正規化することに注意してください。
半角のまま訓練したモデルに半角入力を合わせるには、両側で `normalize: false` が必要です。

### `wsConst`

各文字が、対応する 1 つの文字種の内部での分割を抑止します。

| 文字 | 文字種 | 例（テスト用モデル） |
|---|---|---|
| `D` | 数字 | `12は数字だ` → `1 2 は 数字 だ` → `12 は 数字 だ` |
| `R` | ラテン文字 | `ABは英字だ` → `A B は 英字 だ` → `AB は 英字 だ` |
| `H` | ひらがな | `…数え た ところ だ` → `…数えたところだ` |
| `T` | カタカナ | `アイは片仮名だ` → `ア イ は…` → `アイ は…` |
| `K` | 漢字 | `今 深海 魚 を…` → `今深海魚 を…` |
| `O` | その他 | `＊＃は記号だ` → `＊ ＃ は…` → `＊＃ は…` |
| `G` | 書記素クラスタ | `か`+U+3099 → `か` `゙` → `が` |

`wsConst: "DGR"` のように自由に組み合わせられます。未知の文字を渡すと例外になります。

sqlite-vaporetto とは異なり、js-vaporetto は `SplitLinebreaksFilter` を**適用しません**。
そのためトークンが改行をまたぐことがあります。公式の python-vaporetto に合わせています。

### エラーとライフタイム

* 不正なモデルバイト列は捕捉可能な `Error` になります。空の `Uint8Array` も同様です。
  その後も wasm モジュールは使い続けられます。
* 入力に NUL 文字が含まれると例外になります。空文字列は `[]` / `""` を返します。
* `free()` 後にメソッドを呼ぶと、モジュールが落ちるのではなく
  `null pointer passed to rust` の例外になります。
* `free()` と `[Symbol.dispose]()` は冪等です。`using` と明示的な `free()` を
  併用しても問題ありません。
* `using` **文**は任意の糖衣で、明示的リソース管理に対応したエンジンが必要です
  （Node 24+ / Deno 2+ / Bun 1.3+ / 最近のブラウザ）。**ライブラリ本体は using を
  一切使っていません。** 提供しているのは `[Symbol.dispose]()` メソッドだけで、
  これは Node 20 にも存在します。古いエンジンでは `free()` か `[Symbol.dispose]()` を
  直接呼べば済み、他に違いはありません。
* タグ予測データを持たないモデルに `predictTags: true` を指定した場合、例外ではなく
  空の `tags` が返ります。上流 Vaporetto の挙動に合わせています。KyTea モデルは
  タグデータを持たないため、`fromKyteaModel` は `predictTags` を強制的に false にします。

## ベンチマーク

Apple M シリーズ、macOS 25.5、Node 24.14.0。モデルは `bccwj-suw+unidic_pos+pron`
（非圧縮 55.8 MB）、入力は『吾輩は猫である』（パブリックドメイン）から 2,000 行 /
342,395 文字 / 224,724 トークン。3 回実行の最良値。
`node bench/run.mjs --dist dist/node --model <model> --corpus <file>` で再現できます。

### 単発 vs バッチ

| | 時間 | スループット |
|---|---:|---:|
| `tokenize` 単発 | 121 ms | 280 万 文字/s |
| `tokenizeBatch`（1 回） | 130 ms | 260 万 文字/s |
| `tokenizeToString` 単発 | 31 ms | 1,110 万 文字/s |

**`tokenizeBatch` は速くなりません。** 導入の前提だった「呼び出しごとの UTF-16 → UTF-8
変換とコピーが支配的」という想定は、ここでは成り立ちませんでした。`tokenizeToString` は
同じトークナイズと同じ入力コピーを 4 分の 1 の時間で終えています。つまり入力の境界越えは
安く、コストは 224,724 個のトークンオブジェクト生成のほうで、これはバッチ化しても減りません。

`Vec<String>` を受け取る初期実装は明確に**悪化**していました（0.75 倍）。wasm-bindgen が
全入力文字列を wasm メモリに先に確保してしまうためです。現在の実装は 1 件ずつ受け渡すので
単発比 0.92〜1.04 倍まで戻っています。API 互換のため、また `predictTags` 有効時にはわずかに
勝るため残していますが、**自分のワークロードで速くなることを計測してから使ってください。**

### python-vaporetto との比較

同一マシン・同一モデル・同一入力。python-vaporetto 0.6.5（同じく vaporetto 0.6.5 を
ラップ）。仕事量を揃えるため、python 側もトークンの各フィールドを実体化しています。

| | python-vaporetto | js-vaporetto | |
|---|---:|---:|---|
| モデル読込 | 2,160 ms | **1,102 ms** | js が 2.0 倍速い |
| `tokenize` | **44 ms** | 122 ms | python が 2.8 倍速い |
| `tokenizeToString` | **17 ms** | 31 ms | python が 1.8 倍速い |
| `tokenize` + タグ | **117 ms** | 276 ms | python が 2.4 倍速い |

js-vaporetto の読込が速いのは `charwise-pma` を無効にしてビルドしているからです（後述）。
python-vaporetto は vaporetto の既定のままです。トークナイズ側の差は JS オブジェクトへの
変換コストで、境界を 1 回だけ文字列で渡す `tokenizeToString` なら 1.8 倍差に収まります。

### `charwise-pma`

Vaporetto の `charwise-pma` feature は daachorse の charwise 版オートマトンに切り替えます。
上流は「予測は速くなるがモデルファイルの読み込みは遅くなりうる」と説明しています。
ここでの実測（順序を入れ替えて 3 回）は次のとおりです。

| | wasm（`-Oz`） | モデル読込 | `tokenize` |
|---|---:|---:|---:|
| 有効 | 343,698 B | 2,111–2,136 ms | 103–115 ms |
| **無効（既定）** | **316,465 B** | **1,038–1,133 ms** | 112–120 ms |

wasm が 8.6% 増え、モデル読込がおよそ 2 倍（+1,050 ms）になる一方、トークナイズの向上は
5〜8% 程度で実行ごとのばらつきとほぼ同じ水準です。損益分岐はモデル 1 回の読み込みあたり
約 4,500 万文字で、ブラウザのセッションでは到達しません。よって**既定では無効**です。
1 プロセスでそれを大きく超える量を処理する常駐サーバでは、`--features charwise-pma` で
有効にする価値があります。

## 検証済みランタイム

実際に動かしたバージョンだけを載せています。Vite の行以外は push のたびに CI で実行されます。
Vite 連携は手動で検証しました（ビルドと、ビルド結果の Chromium 実行）。
Node 20 は上流で 2026-04-30 に EOL を迎えています。`engines` が対応を謳っている以上
テストしているというだけで、推奨という意味ではありません。

| ランタイム | バージョン | export 条件 | ターゲット |
|---|---|---|---|
| Node.js | 20.x, 22.x, 24.x | `node` | `dist/node`（CommonJS）。`using` は 24+ が必要 |
| Deno | 2.x | `deno` | `dist/deno` |
| Bun | 1.3.x | `bun` | `dist/node` |
| Chromium | Playwright stable | — | `dist/web` |
| Firefox | Playwright stable | — | `dist/web` |
| Vite | 7.3.x | `browser` / `default` | `dist/bundler`（`vite-plugin-wasm` 必要）または `dist/web` |

### なぜ `bun` が Node ターゲットを指しているのか

`bun` 条件は推測ではなく実験で決めました。Bun 1.3.11 で
`dist/bundler/vaporetto.js` を読み込むと失敗します。

```
TypeError: wasm.__wbindgen_start is not a function.
  (In 'wasm.__wbindgen_start()', 'wasm.__wbindgen_start' is undefined)
```

Bun の `.wasm` 直接 import は、bundler 用グルーが期待する形でモジュールのエクスポートを
公開しません。`dist/node` は動くので、`bun` 条件はそちらに解決させています。
この確認はテストスイートに含まれています（`bun test tests/bun.test.ts`）。

もう 1 つ、遭遇すると戸惑う Bun の挙動を記録しておきます。Bun の**自己参照**解決
（パッケージが自分自身を名前で import する場合）は `types` 条件にマッチし、
`dist/types/index.d.ts` を実行しようとして紛らわしい `SyntaxError` を出します。
条件の順序を変えても直りません。利用者が実際に通る `node_modules` 経由の通常解決では
`dist/node` が正しく選ばれるので、影響はこのリポジトリ内で作業するときだけです。
テストがそうしているように、その場合はターゲットのパスを直接 import してください。

## ビルド

```sh
./scripts/setup-toolchain.sh   # wasm-pack, wasm-bindgen-cli, binaryen をバージョン固定で取得
export PATH="$PWD/tmp/bin:$PATH"
./scripts/build.sh             # 4 ターゲットを dist/ へ
npm test                       # Rust + Node + Deno + Bun + ブラウザ
```

ツールのバージョンは全て固定しています。同種のプロジェクトを保守する人には知っておく
価値のある理由があります。

* **wasm-pack 0.15.0。** リポジトリが `drager/wasm-pack` から
  `wasm-bindgen/wasm-pack` に移管され、0.14.0 の npm パッケージは旧リリース URL を
  指したままで 404 になります
  （[#1577](https://github.com/wasm-bindgen/wasm-pack/issues/1577)）。
* **wasm-bindgen-cli は `wasm-bindgen` crate とバージョンが完全一致していないと**
  スキーマ検査で落ちます。wasm-pack はそのバージョンを `Cargo.lock` から読むため、
  lockfile をコミットしています。また wasm-pack 0.15.0 は macOS aarch64 向けの
  wasm-bindgen プリビルドを解決できず、数分かかる `cargo install` にフォールバックします。
  バイナリを `PATH` に置いておけば回避できます。
* **binaryen `version_131`。** wasm-pack 0.15.0 は `version_117`（2024-02-28 リリース）を
  ハードコードしており、`Cargo.toml` から上書きする手段がありません。
  `[package.metadata.wasm-pack.profile.release]` で受け付けられるのは bool か引数配列だけです。
  そこでは `wasm-opt = false` にして、`build.sh` が固定バージョンの `wasm-opt -Oz` を
  自前で実行しています。

Cargo feature:

| feature | 既定 | 効果 |
|---|---|---|
| `zstd` | 有効 | `fromCompressedModel`。wasm が約 64 KB 増える |
| `charwise-pma` | 無効 | [上記](#charwise-pma) 参照。約 27 KB 増える |
| `console_error_panic_hook` | 無効 | デバッグ用に panic のスタックトレースを読めるようにする。リリースビルド向けではない |

`dist/` は意図的にコミットしています。GitHub から直接インストールされるパッケージだからです。
CI が再ビルドし、コミット済みの内容と差があれば失敗します。`.wasm` は 4 ターゲットとも
バイト単位で同一なので、作業ツリー上は約 1.3 MB になりますが git は 1 つの blob として
保持します。

## ライセンス

以下のいずれかを選択できます。

* Apache License, Version 2.0（[LICENSE-APACHE](LICENSE-APACHE)）
* MIT ライセンス（[LICENSE-MIT](LICENSE-MIT)）

## 謝辞

* [Vaporetto](https://github.com/daac-tools/vaporetto)（赤部晃一氏ほか）—
  本プロジェクトがラップしているトークナイザ。
* [python-vaporetto](https://github.com/daac-tools/python-vaporetto) — 公式バインディング。
  正規化後のテキストで予測し、得られた境界とタグだけを元テキストから作った `Sentence` に
  転写する方式はここから採りました。
* [sqlite-vaporetto](https://github.com/hotchpotch/sqlite-vaporetto)（hotchpotch 氏）—
  Vaporetto 0.6.5 を実際に呼んでいる動作実績のあるコード。`wsConst` の文字マッピングと
  オフセット復元の構造はここから採りました。冒頭の分割一貫性に関する注意も同 README が出典です。

全ての帰属表示は [NOTICE](NOTICE) にあります。ソース中でも、参考にした箇所ごとに
該当関数のコメントで出典を明記しています。
