//! js-vaporetto — unofficial WebAssembly bindings for Vaporetto 0.6.5.
//!
//! Design notes, for the parts that are not obvious from the code:
//!
//! * `Sentence` borrows `Predictor`, so it cannot be held as a struct field.
//!   It is therefore built per call. sqlite-vaporetto does the same and works.
//! * With normalization on, prediction runs on the *normalized* text and only
//!   the resulting boundaries and tags are transferred onto a `Sentence` built
//!   from the *original* text (the approach python-vaporetto takes). That keeps
//!   token surfaces in the original text and lets us reuse upstream's
//!   `write_tokenized_text` escaping rules verbatim.
//! * The transfer is only valid because `KyteaFullwidthFilter` maps one
//!   character to exactly one character. That was verified empirically over all
//!   1,112,064 Unicode scalar values. Should the assumption ever break, the
//!   character counts are compared before the transfer so it fails loudly
//!   instead of silently shifting every offset.
//! * Vaporetto reports `Token::start()/end()` in Unicode code points, while
//!   JavaScript's `String.prototype.slice()` indexes UTF-16 code units, so the
//!   two are converted at the boundary.

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
// TypeScript types
//
// The auto-generated .d.ts would type arguments and return values as `any` or
// `JsValue`, so the interfaces are declared here and bound to each method
// through the extern block below.
// -----------------------------------------------------------------------------

#[wasm_bindgen(typescript_custom_section)]
const TS_APPEND_CONTENT: &'static str = r#"
export interface VaporettoOptions {
  /** Predict part-of-speech / reading tags. Default false. */
  predictTags?: boolean;
  /** Character classes not to segment: any combination of "D R H T K O G" (e.g. "DGR"). Default "". */
  wsConst?: string;
  /** Normalize the input before prediction. Default true. */
  normalize?: boolean;
}

export interface Token {
  surface: string;
  /** Offset into the input string, in UTF-16 code units (inclusive). */
  start: number;
  /** Same, exclusive. */
  end: number;
  /** Empty array when predictTags is false. */
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
// Versions
//
// wasm-bindgen cannot export constants, and with --target web the wasm module
// is initialized asynchronously, so the values cannot be read from wasm at
// module load time either. VAPORETTO_VERSION and JS_VAPORETTO_VERSION are
// therefore defined as plain constants in the JS wrapper that scripts/build.sh
// generates; these functions are what it reads them from.
// -----------------------------------------------------------------------------

/// Version of the Vaporetto crate this was built against. Used to generate the
/// JS wrapper.
#[wasm_bindgen(js_name = __vaporettoVersion)]
pub fn vaporetto_version() -> String {
    vaporetto::VERSION.to_string()
}

/// Version of js-vaporetto itself. Used to generate the JS wrapper.
#[wasm_bindgen(js_name = __jsVaporettoVersion)]
pub fn js_vaporetto_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// -----------------------------------------------------------------------------
// Internal types
// -----------------------------------------------------------------------------

fn to_js_error<E: Display>(e: E) -> JsError {
    JsError::new(&e.to_string())
}

fn init_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

// NOTE: `deny_unknown_fields` is deliberately absent. serde-wasm-bindgen looks
// up known field names with Reflect::get and never enumerates the JS object's
// keys, so the attribute would have no effect. Ignoring unknown keys is the JS
// convention anyway, and TypeScript users get compile-time checking from the
// VaporettoOptions type. Wrong value types are still rejected.
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
    /// `undefined` and `null` are treated as "use the defaults".
    fn from_js(value: Option<JsValue>) -> Result<Self, JsError> {
        match value {
            None => Ok(Self::default()),
            Some(v) if v.is_undefined() || v.is_null() => Ok(Self::default()),
            Some(v) => serde_wasm_bindgen::from_value(v).map_err(to_js_error),
        }
    }
}

/// A token as returned to JS. Exposing the struct as a JS class would make its
/// release depend on FinalizationRegistry and therefore non-deterministic, so
/// it is serialized to a plain object instead.
#[derive(Serialize)]
struct TokenOut {
    surface: String,
    start: u32,
    end: u32,
    tags: Vec<Option<String>>,
}

fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, JsError> {
    // By default None would serialize to undefined. The TS type is
    // (string | null)[], so emit null.
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_missing_as_null(true);
    value.serialize(&serializer).map_err(to_js_error)
}

/// Converts a Unicode code point index into a UTF-16 code unit offset.
///
/// Japanese text is almost entirely inside the BMP, where the two indices are
/// identical, so no table is built. It is only allocated when the input
/// contains at least one surrogate pair.
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
            // char_index comes from Token::start()/end() and is always in range.
            // Even so, do not index directly: in wasm a panic aborts the whole
            // module, taking every other tokenizer instance with it.
            Self::Table(table) => table
                .get(char_index)
                .copied()
                .unwrap_or_else(|| table.last().copied().unwrap_or(0)),
        }
    }
}

/// Builds the post filters from a wsConst string.
///
/// The D/R/H/T/K/O/G mapping is adapted from sqlite-vaporetto's
/// `build_post_filters()` (https://github.com/hotchpotch/sqlite-vaporetto,
/// MIT OR Apache-2.0). Unlike that implementation we do not unconditionally
/// prepend `SplitLinebreaksFilter`, because the official python-vaporetto
/// binding does not either.
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
// Public API
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
    /// Creates a tokenizer from an uncompressed Vaporetto model.
    #[wasm_bindgen(js_name = fromModel)]
    pub fn from_model(
        model: &[u8],
        options: Option<VaporettoOptions>,
    ) -> Result<Vaporetto, JsError> {
        init_panic_hook();
        let options = Options::from_js(options.map(Into::into))?;
        // Model::read, not Model::read_slice. The latter slices the first 25
        // bytes without a bounds check and panics on an empty Uint8Array.
        // &[u8] implements io::Read, so this path returns Err instead.
        let model = Model::read(model).map_err(to_js_error)?;
        Self::build(model, options)
    }

    /// Creates a tokenizer from a KyTea model. Tag prediction is not supported.
    #[wasm_bindgen(js_name = fromKyteaModel)]
    pub fn from_kytea_model(
        model: &[u8],
        options: Option<KyteaModelOptions>,
    ) -> Result<Vaporetto, JsError> {
        init_panic_hook();
        let mut options = Options::from_js(options.map(Into::into))?;
        // KyTea models carry no tag data. python-vaporetto forces this too.
        options.predict_tags = false;
        let kytea_model = vaporetto::KyteaModel::read(model).map_err(to_js_error)?;
        let model = Model::try_from(kytea_model).map_err(to_js_error)?;
        Self::build(model, options)
    }

    /// Creates a tokenizer from a zstd-compressed model.
    #[cfg(feature = "zstd")]
    #[wasm_bindgen(js_name = fromCompressedModel)]
    pub fn from_compressed_model(
        model: &[u8],
        options: Option<VaporettoOptions>,
    ) -> Result<Vaporetto, JsError> {
        use std::io::Read as _;

        init_panic_hook();
        let options = Options::from_js(options.map(Into::into))?;
        // ruzstd 0.8 has no free function like decode_all; use the same
        // StreamingDecoder that sqlite-vaporetto's load_model_from_bytes() does.
        let mut decoder = ruzstd::decoding::StreamingDecoder::new(model).map_err(to_js_error)?;
        let mut buf = Vec::new();
        decoder.read_to_end(&mut buf).map_err(to_js_error)?;
        let model = Model::read(buf.as_slice()).map_err(to_js_error)?;
        Self::build(model, options)
    }

    /// Tokenizes `text`. `start` and `end` are UTF-16 code unit offsets.
    pub fn tokenize(&self, text: &str) -> Result<TokenArray, JsError> {
        let tokens = self.collect_tokens(text)?;
        Ok(to_js_value(&tokens)?.into())
    }

    /// Batched form of `tokenize`.
    ///
    /// Measured against a real model this is not faster than calling `tokenize`
    /// in a loop; see the benchmark section of the README before reaching for it.
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

    /// Returns the tokenization as a string, tokens separated by a single
    /// space. With tag prediction enabled, tags follow each token after a `/`.
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
        // Sentence::from_raw("") returns Err, so bail out on empty input here.
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
                // With tag prediction off, n_tags == 0 and this slice is empty.
                tags: token
                    .tags()
                    .iter()
                    .map(|tag| tag.as_ref().map(|t| t.to_string()))
                    .collect(),
            })
            .collect())
    }

    /// Builds a predicted `Sentence` that corresponds to the original text.
    ///
    /// The returned `Sentence<'a, 'a>` borrows both `&'a self` (for the
    /// `Predictor`) and `text`, so it cannot outlive the caller's scope.
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

        // If the one-character-to-one-character mapping ever breaks, every
        // offset after the transfer silently shifts. Catch it here and return a
        // real error rather than relying on copy_from_slice / clone_from_slice
        // to panic.
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
