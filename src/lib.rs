//! js-vaporetto — Vaporetto 0.6.5 の非公式 WebAssembly バインディング。
//!
//! 設計メモ（Rust に不慣れな読み手向け）:
//!
//! * `Sentence` は `Predictor` を借用するため構造体のフィールドとして保持できない。
//!   よって呼び出しごとに生成する。sqlite-vaporetto が同じ方針で動作実績がある。
//! * 正規化を有効にすると、予測は「正規化後テキスト」で行い、結果の境界だけを
//!   「元テキスト」の `Sentence` に転写する（python-vaporetto と同じ方式）。
//!   こうすると表層文字列が常に元テキスト由来になり、`write_tokenized_text` の
//!   エスケープ規則も上流の実装をそのまま使える。
//! * この転写が成立するのは `KyteaFullwidthFilter` が「1 文字 → 1 文字」を保つため。
//!   全 Unicode スカラ値 1,112,064 個で実測して確認済み（Phase 1 調査）。
//!   将来この前提が崩れたときに黙ってオフセットがずれないよう、転写前に
//!   文字数の一致を明示的に検証してエラーに変換している。

use vaporetto::{Model, Predictor, Sentence};
use vaporetto_rules::{string_filters::KyteaFullwidthFilter, StringFilter};
use wasm_bindgen::prelude::*;

// NOTE: wasm-bindgen は const をエクスポートできない（"will not work on constants"）。
// また --target web では wasm の初期化が非同期なので、モジュール読み込み時点で
// wasm 側から値を読むこともできない。よって VAPORETTO_VERSION / JS_VAPORETTO_VERSION は
// ビルド時に生成する JS ラッパ側でプレーンな定数として定義する。
// ここではその生成元となる値を Rust 側から取り出せるようにしておく。

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

/// Vaporetto のエラーを JS の Error に変換する。
fn to_js_error<E: core::fmt::Display>(e: E) -> JsError {
    JsError::new(&e.to_string())
}

#[wasm_bindgen]
pub struct Vaporetto {
    predictor: Predictor,
    prefilter: KyteaFullwidthFilter,
    normalize: bool,
}

#[wasm_bindgen]
impl Vaporetto {
    /// 非圧縮の Vaporetto モデルから生成する。
    ///
    /// `Model::read_slice` ではなく `Model::read` を使う。前者は先頭 25 バイトを
    /// 境界チェックなしにスライスするため、25 バイト未満の入力で panic する。
    /// `&[u8]` は `std::io::Read` を実装しているので、後者なら安全に `Err` が返る。
    #[wasm_bindgen(js_name = fromModel)]
    pub fn from_model(model: &[u8]) -> Result<Vaporetto, JsError> {
        let model = Model::read(model).map_err(to_js_error)?;
        let predictor = Predictor::new(model, false).map_err(to_js_error)?;
        Ok(Self {
            predictor,
            prefilter: KyteaFullwidthFilter,
            normalize: true,
        })
    }

    /// 分かち書き結果を文字列で返す。区切りは半角スペース。
    #[wasm_bindgen(js_name = tokenizeToString)]
    pub fn tokenize_to_string(&self, text: &str) -> Result<String, JsError> {
        // Sentence::from_raw("") は Err になるので、空入力はここで打ち切る。
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
    /// 元テキストに対応する、予測済みの `Sentence` を作る。
    ///
    /// 返り値の `Sentence<'a, 'a>` は `&'a self`（= `Predictor`）と `text` の
    /// 両方を借用するので、呼び出し元のスコープ内でしか生きられない。
    fn predict<'a>(&'a self, text: &'a str) -> Result<Sentence<'a, 'a>, JsError> {
        let mut sentence = Sentence::from_raw(text).map_err(to_js_error)?;

        if self.normalize {
            let normalized = self.prefilter.filter(text);
            let mut norm_sentence = Sentence::from_raw(normalized).map_err(to_js_error)?;

            // 1 文字 → 1 文字 が崩れると、以降の境界転写が黙ってずれる。
            // copy_from_slice の panic に頼らず、ここで捕捉可能なエラーにする。
            if norm_sentence.boundaries().len() != sentence.boundaries().len() {
                return Err(JsError::new(
                    "normalization changed the character count; \
                     cannot map token offsets back to the original text",
                ));
            }

            self.predictor.predict(&mut norm_sentence);
            sentence
                .boundaries_mut()
                .copy_from_slice(norm_sentence.boundaries());
        } else {
            self.predictor.predict(&mut sentence);
        }

        Ok(sentence)
    }
}
