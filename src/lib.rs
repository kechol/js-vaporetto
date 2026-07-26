//! js-vaporetto — Vaporetto 0.6.5 の非公式 WebAssembly バインディング。
//!
//! 設計メモ（Rust に不慣れな読み手向け）:
//!
//! * `Sentence` は `Predictor` を借用するため構造体のフィールドとして保持できない。
//!   よって呼び出しごとに生成する。sqlite-vaporetto が同じ方針で動作実績がある。
//! * 正規化を有効にすると、予測は「正規化後テキスト」で行い、結果の境界とタグだけを
//!   「元テキスト」の `Sentence` に転写する（python-vaporetto と同じ方式）。
//!   こうすると表層文字列が常に元テキスト由来になり、`write_tokenized_text` の
//!   エスケープ規則も上流の実装をそのまま使える。
//! * この転写が成立するのは `KyteaFullwidthFilter` が「1 文字 → 1 文字」を保つため。
//!   全 Unicode スカラ値 1,112,064 個で実測して確認済み。将来この前提が崩れたときに
//!   黙ってオフセットがずれないよう、転写前に文字数の一致を明示的に検証している。
//! * Vaporetto の `Token::start()/end()` は Unicode コードポイント単位だが、JS の
//!   `String.prototype.slice()` は UTF-16 コード単位なので、境界で変換する。

use core::fmt::Display;

use serde::{Deserialize, Serialize};
use vaporetto::{CharacterType, Model, Predictor, Sentence};
use vaporetto_rules::{
    sentence_filters::{ConcatGraphemeClustersFilter, KyteaWsConstFilter},
    string_filters::KyteaFullwidthFilter,
    SentenceFilter, StringFilter,
};
use wasm_bindgen::prelude::*;

// -----------------------------------------------------------------------------
// TypeScript の型
//
// 自動生成される .d.ts だけだと引数・戻り値が `any` / `JsValue` になるので、
// interface をここで宣言し、下の extern ブロックで各メソッドに結びつける。
// -----------------------------------------------------------------------------

#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"
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
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "VaporettoOptions")]
    pub type VaporettoOptions;

    #[wasm_bindgen(typescript_type = "Omit<VaporettoOptions, \"predictTags\">")]
    pub type KyteaModelOptions;

    #[wasm_bindgen(typescript_type = "Token[]")]
    pub type TokenArray;

    #[wasm_bindgen(typescript_type = "Token[][]")]
    pub type TokenArrayArray;

    #[wasm_bindgen(typescript_type = "string[]")]
    pub type StringArray;
}

// -----------------------------------------------------------------------------
// バージョン
//
// wasm-bindgen は const をエクスポートできず、--target web では初期化が非同期なので
// モジュール読み込み時点で wasm 側の値を読むこともできない。よって
// VAPORETTO_VERSION / JS_VAPORETTO_VERSION はビルド時に生成する JS ラッパ側で
// プレーンな定数として定義する。ここはその生成元。
// -----------------------------------------------------------------------------

/// 依存している Vaporetto のバージョン（ラッパ生成用）。
#[wasm_bindgen(js_name = __vaporettoVersion)]
pub fn vaporetto_version() -> String {
    vaporetto::VERSION.to_string()
}

/// js-vaporetto 自身のバージョン（ラッパ生成用）。
#[wasm_bindgen(js_name = __jsVaporettoVersion)]
pub fn js_vaporetto_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// -----------------------------------------------------------------------------
// 内部型
// -----------------------------------------------------------------------------

fn to_js_error<E: Display>(e: E) -> JsError {
    JsError::new(&e.to_string())
}

fn init_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

// NOTE: `deny_unknown_fields` は付けていない。serde-wasm-bindgen は既知のフィールド名を
// Reflect::get で引くだけで JS オブジェクトのキーを列挙しないため、指定しても効かない。
// 未知のキーを黙って無視するのは JS の慣例どおりであり、TypeScript 利用者は
// VaporettoOptions の型でコンパイル時に検出できる。値の型違いは検出される。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Options {
    predict_tags: bool,
    ws_const: String,
    normalize: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            predict_tags: false,
            ws_const: String::new(),
            normalize: true,
        }
    }
}

impl Options {
    /// `undefined` / `null` は既定値として扱う。
    fn from_js(value: Option<JsValue>) -> Result<Self, JsError> {
        match value {
            None => Ok(Self::default()),
            Some(v) if v.is_undefined() || v.is_null() => Ok(Self::default()),
            Some(v) => serde_wasm_bindgen::from_value(v).map_err(to_js_error),
        }
    }
}

/// JS に返すトークン。struct を JS クラスとして公開すると解放が
/// FinalizationRegistry 頼みの非決定的なものになるので、プレーンオブジェクトに
/// シリアライズして返す。
#[derive(Serialize)]
struct TokenOut {
    surface: String,
    start: u32,
    end: u32,
    tags: Vec<Option<String>>,
}

fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, JsError> {
    // 既定では None が undefined になってしまう。TS 型は (string | null)[] なので
    // null で出す。
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_missing_as_null(true);
    value.serialize(&serializer).map_err(to_js_error)
}

/// Unicode コードポイント索引 → UTF-16 コード単位オフセット の変換。
///
/// 日本語テキストはほぼ全て BMP 内に収まり、その場合は両者が一致するので
/// テーブルを作らない。サロゲートペアが 1 文字でもあるときだけ確保する。
enum Utf16Map {
    Identity,
    Table(Vec<u32>),
}

impl Utf16Map {
    fn new(text: &str) -> Self {
        if !text.chars().any(|c| c.len_utf16() == 2) {
            return Self::Identity;
        }
        let mut table = Vec::with_capacity(text.chars().count() + 1);
        let mut pos = 0u32;
        table.push(pos);
        for c in text.chars() {
            pos += c.len_utf16() as u32;
            table.push(pos);
        }
        Self::Table(table)
    }

    fn at(&self, char_index: usize) -> u32 {
        match self {
            Self::Identity => char_index as u32,
            // char_index は Token::start()/end() 由来なので必ず範囲内。ただし wasm は
            // panic = abort でモジュール全体が死ぬため、添字アクセスでは落とさない。
            Self::Table(table) => table
                .get(char_index)
                .copied()
                .unwrap_or_else(|| table.last().copied().unwrap_or(0)),
        }
    }
}

/// wsConst の文字列から post filter を組み立てる。
///
/// D/R/H/T/K/O/G のマッピングは sqlite-vaporetto の `build_post_filters()`
/// (https://github.com/hotchpotch/sqlite-vaporetto, MIT OR Apache-2.0) から。
/// ただし sqlite-vaporetto が無条件で先頭に積む `SplitLinebreaksFilter` は
/// 積んでいない。公式バインディングの python-vaporetto がそうしていないため。
fn build_post_filters(ws_const: &str) -> Result<Vec<Box<dyn SentenceFilter>>, JsError> {
    let mut filters: Vec<Box<dyn SentenceFilter>> = Vec::new();
    for c in ws_const.chars() {
        filters.push(match c {
            'D' => Box::new(KyteaWsConstFilter::new(CharacterType::Digit)),
            'R' => Box::new(KyteaWsConstFilter::new(CharacterType::Roman)),
            'H' => Box::new(KyteaWsConstFilter::new(CharacterType::Hiragana)),
            'T' => Box::new(KyteaWsConstFilter::new(CharacterType::Katakana)),
            'K' => Box::new(KyteaWsConstFilter::new(CharacterType::Kanji)),
            'O' => Box::new(KyteaWsConstFilter::new(CharacterType::Other)),
            'G' => Box::new(ConcatGraphemeClustersFilter),
            _ => {
                return Err(JsError::new(&format!(
                    "invalid wsConst character: {c:?} (expected one of D, R, H, T, K, O, G)"
                )))
            }
        });
    }
    Ok(filters)
}

// -----------------------------------------------------------------------------
// 公開 API
// -----------------------------------------------------------------------------

#[wasm_bindgen]
pub struct Vaporetto {
    predictor: Predictor,
    prefilter: KyteaFullwidthFilter,
    postfilters: Vec<Box<dyn SentenceFilter>>,
    predict_tags: bool,
    normalize: bool,
}

#[wasm_bindgen]
impl Vaporetto {
    /// 非圧縮の Vaporetto モデルから生成する。
    #[wasm_bindgen(js_name = fromModel)]
    pub fn from_model(
        model: &[u8],
        options: Option<VaporettoOptions>,
    ) -> Result<Vaporetto, JsError> {
        init_panic_hook();
        let options = Options::from_js(options.map(Into::into))?;
        // Model::read_slice ではなく Model::read を使う。前者は先頭 25 バイトを
        // 境界チェックなしにスライスするため、空の Uint8Array で panic する。
        // &[u8] は io::Read を実装しているので、後者なら安全に Err が返る。
        let model = Model::read(model).map_err(to_js_error)?;
        Self::build(model, options)
    }

    /// KyTea モデルから生成する。タグ予測は非対応。
    #[wasm_bindgen(js_name = fromKyteaModel)]
    pub fn from_kytea_model(
        model: &[u8],
        options: Option<KyteaModelOptions>,
    ) -> Result<Vaporetto, JsError> {
        init_panic_hook();
        let mut options = Options::from_js(options.map(Into::into))?;
        // KyTea モデルはタグ予測データを持たない。python-vaporetto も同様に強制 false。
        options.predict_tags = false;
        let kytea_model = vaporetto::KyteaModel::read(model).map_err(to_js_error)?;
        let model = Model::try_from(kytea_model).map_err(to_js_error)?;
        Self::build(model, options)
    }

    /// zstd 圧縮されたモデルから生成する。
    #[cfg(feature = "zstd")]
    #[wasm_bindgen(js_name = fromCompressedModel)]
    pub fn from_compressed_model(
        model: &[u8],
        options: Option<VaporettoOptions>,
    ) -> Result<Vaporetto, JsError> {
        use std::io::Read as _;

        init_panic_hook();
        let options = Options::from_js(options.map(Into::into))?;
        // ruzstd 0.8 に decode_all のようなフリー関数は無い。
        // sqlite-vaporetto の load_model_from_bytes() と同じ StreamingDecoder を使う。
        let mut decoder = ruzstd::decoding::StreamingDecoder::new(model).map_err(to_js_error)?;
        let mut buf = Vec::new();
        decoder.read_to_end(&mut buf).map_err(to_js_error)?;
        let model = Model::read(buf.as_slice()).map_err(to_js_error)?;
        Self::build(model, options)
    }

    /// トークン列を返す。`start` / `end` は UTF-16 コード単位。
    pub fn tokenize(&self, text: &str) -> Result<TokenArray, JsError> {
        let tokens = self.collect_tokens(text)?;
        Ok(to_js_value(&tokens)?.into())
    }

    /// 文字列コピーのオーバーヘッドを償却するためのバッチ版。
    #[wasm_bindgen(js_name = tokenizeBatch)]
    pub fn tokenize_batch(&self, texts: &StringArray) -> Result<TokenArrayArray, JsError> {
        // Pull one string across at a time instead of letting wasm-bindgen
        // materialize the whole Vec<String> up front: peak wasm memory stays
        // flat and each input is freed before the next is copied in.
        let input: &js_sys::Array = texts.unchecked_ref();
        let len = input.length();
        let output = js_sys::Array::new_with_length(len);
        for i in 0..len {
            let text = input
                .get(i)
                .as_string()
                .ok_or_else(|| JsError::new("tokenizeBatch expects an array of strings"))?;
            output.set(i, to_js_value(&self.collect_tokens(&text)?)?);
        }
        Ok(JsValue::from(output).into())
    }

    /// 分かち書き結果を文字列で返す。区切りは半角スペース。
    /// タグ予測が有効なときはタグが `/` 区切りで付く。
    #[wasm_bindgen(js_name = tokenizeToString)]
    pub fn tokenize_to_string(&self, text: &str) -> Result<String, JsError> {
        if text.is_empty() {
            return Ok(String::new());
        }
        let sentence = self.predict(text)?;
        let mut buf = String::new();
        sentence.write_tokenized_text(&mut buf);
        Ok(buf)
    }
}

impl Vaporetto {
    fn build(model: Model, options: Options) -> Result<Vaporetto, JsError> {
        let postfilters = build_post_filters(&options.ws_const)?;
        let predictor = Predictor::new(model, options.predict_tags).map_err(to_js_error)?;
        Ok(Self {
            predictor,
            prefilter: KyteaFullwidthFilter,
            postfilters,
            predict_tags: options.predict_tags,
            normalize: options.normalize,
        })
    }

    fn collect_tokens(&self, text: &str) -> Result<Vec<TokenOut>, JsError> {
        // Sentence::from_raw("") は Err になるので、空入力はここで打ち切る。
        if text.is_empty() {
            return Ok(Vec::new());
        }
        let sentence = self.predict(text)?;
        let utf16 = Utf16Map::new(text);
        Ok(sentence
            .iter_tokens()
            .map(|token| TokenOut {
                surface: token.surface().to_string(),
                start: utf16.at(token.start()),
                end: utf16.at(token.end()),
                // タグ予測が無効なら n_tags == 0 で、この slice は空になる。
                tags: token
                    .tags()
                    .iter()
                    .map(|tag| tag.as_ref().map(|t| t.to_string()))
                    .collect(),
            })
            .collect())
    }

    /// 元テキストに対応する、予測済みの `Sentence` を作る。
    ///
    /// 返り値の `Sentence<'a, 'a>` は `&'a self`（= `Predictor`）と `text` の
    /// 両方を借用するので、呼び出し元のスコープ内でしか生きられない。
    fn predict<'a>(&'a self, text: &'a str) -> Result<Sentence<'a, 'a>, JsError> {
        let mut sentence = Sentence::from_raw(text).map_err(to_js_error)?;

        if !self.normalize {
            self.predictor.predict(&mut sentence);
            for filter in &self.postfilters {
                filter.filter(&mut sentence);
            }
            if self.predict_tags {
                sentence.fill_tags();
            }
            return Ok(sentence);
        }

        let normalized = self.prefilter.filter(text);
        let mut norm_sentence = Sentence::from_raw(normalized).map_err(to_js_error)?;

        // 1 文字 → 1 文字 が崩れると、以降の境界転写が黙ってずれる。
        // copy_from_slice / clone_from_slice の panic に頼らず、ここで
        // 捕捉可能なエラーにする。
        if norm_sentence.boundaries().len() != sentence.boundaries().len() {
            return Err(JsError::new(
                "normalization changed the character count; \
                 cannot map token offsets back to the original text",
            ));
        }

        self.predictor.predict(&mut norm_sentence);
        for filter in &self.postfilters {
            filter.filter(&mut norm_sentence);
        }
        sentence
            .boundaries_mut()
            .copy_from_slice(norm_sentence.boundaries());

        if self.predict_tags {
            norm_sentence.fill_tags();
            sentence.reset_tags(norm_sentence.n_tags());
            sentence.tags_mut().clone_from_slice(norm_sentence.tags());
        }

        Ok(sentence)
    }
}
