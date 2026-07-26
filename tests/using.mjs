// `using` is syntax, so it cannot be feature-detected at runtime — this file
// fails to parse on engines without explicit resource management. Entry points
// import it dynamically and skip the test when the import throws.
export function usingReleasesOnScopeExit({ Vaporetto, model, asserts }) {
  let escaped;
  {
    using tokenizer = Vaporetto.fromModel(model);
    escaped = tokenizer;
    asserts.eq(tokenizer.tokenizeToString("青い空を鳥が飛ぶ"), "青い 空 を 鳥 が 飛ぶ");
  }
  asserts.throws(() => escaped.tokenize("あ"), /null pointer/);
}
