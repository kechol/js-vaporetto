//! Rust-side tests, run inside a wasm engine with `wasm-pack test --node`.
//!
//! The JS suite in `tests/suite.mjs` covers the public behaviour across all four
//! runtimes. These tests cover the parts that are awkward to reach from JS:
//! the code-point to UTF-16 conversion at the Rust boundary, and the error
//! paths that must return `Err` rather than panic (a panic in wasm aborts the
//! whole module, taking every other tokenizer instance with it).
#![cfg(target_arch = "wasm32")]

use js_vaporetto::Vaporetto;
use wasm_bindgen_test::*;

const MODEL: &[u8] = include_bytes!("fixtures/tiny.model");
const MODEL_ZST: &[u8] = include_bytes!("fixtures/tiny.model.zst");

#[wasm_bindgen_test]
fn tokenizes_the_fixture_sentences() {
    let v = Vaporetto::from_model(MODEL, None).unwrap();
    assert_eq!(
        v.tokenize_to_string("今深海魚を数えたところだ").unwrap(),
        "今 深海 魚 を 数え た ところ だ"
    );
    assert_eq!(
        v.tokenize_to_string("青い空を鳥が飛ぶ").unwrap(),
        "青い 空 を 鳥 が 飛ぶ"
    );
}

#[wasm_bindgen_test]
fn empty_input_returns_an_empty_string() {
    let v = Vaporetto::from_model(MODEL, None).unwrap();
    assert_eq!(v.tokenize_to_string("").unwrap(), "");
}

#[wasm_bindgen_test]
fn reads_a_zstd_compressed_model() {
    let v = Vaporetto::from_compressed_model(MODEL_ZST, None).unwrap();
    assert_eq!(
        v.tokenize_to_string("青い空を鳥が飛ぶ").unwrap(),
        "青い 空 を 鳥 が 飛ぶ"
    );
}

#[wasm_bindgen_test]
fn malformed_model_bytes_return_err_instead_of_panicking() {
    // Model::read_slice would index &slice[..25] without a bounds check and
    // abort the module for the short cases. Model::read returns Err.
    for len in [0usize, 1, 3, 24, 25, 64, 1000] {
        assert!(
            Vaporetto::from_model(&vec![0u8; len], None).is_err(),
            "length {len} should be rejected"
        );
    }
    // The module must still be usable.
    let v = Vaporetto::from_model(MODEL, None).unwrap();
    assert_eq!(
        v.tokenize_to_string("青い空を鳥が飛ぶ").unwrap(),
        "青い 空 を 鳥 が 飛ぶ"
    );
}

#[wasm_bindgen_test]
fn a_nul_character_returns_err() {
    let v = Vaporetto::from_model(MODEL, None).unwrap();
    assert!(v.tokenize_to_string("あ\0い").is_err());
}

#[wasm_bindgen_test]
fn a_zstd_model_is_rejected_by_from_model() {
    assert!(Vaporetto::from_model(MODEL_ZST, None).is_err());
}

#[wasm_bindgen_test]
fn uncompressed_bytes_are_rejected_by_from_compressed_model() {
    assert!(Vaporetto::from_compressed_model(MODEL, None).is_err());
}
