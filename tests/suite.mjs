// The one and only test body. Runtime-specific entry points (node.test.mjs,
// deno.test.ts, bun.test.ts, browser/index.html) load the module and the
// fixture bytes their own way, then hand them to `createSuite`.
//
// Keep this file free of any runtime-specific API: no node:fs, no Deno.*, no
// bun:*. It must be loadable in a browser as a plain ES module.

/**
 * Combining marks and emoji sequences must be written as escapes. Editors and
 * some tooling silently normalize a literal "か" + U+3099 into the precomposed
 * U+304C, which turns a two-code-point test case into a one-code-point one and
 * makes the test pass without testing anything.
 */
export const GRAPHEMES = [
  ["surrogate pair kanji", "\u{29E3D}"],
  ["hiragana + combining voiced mark", "が"],
  ["latin + combining acute", "é"],
  ["ZWJ emoji family", "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}"],
  ["regional indicator pair", "\u{1F1EF}\u{1F1F5}"],
  ["emoji + skin tone modifier", "\u{1F44D}\u{1F3FD}"],
  ["hangul conjoining jamo", "각"],
];

/** Each wsConst character must merge its own character type and nothing else. */
export const WS_CONST_CASES = [
  ["D", "12は数字だ", "1 2 は 数字 だ", "12 は 数字 だ"],
  ["R", "ABは英字だ", "A B は 英字 だ", "AB は 英字 だ"],
  ["H", "今深海魚を数えたところだ", "今 深海 魚 を 数え た ところ だ", "今 深海 魚 を 数えたところだ"],
  ["T", "アイは片仮名だ", "ア イ は 片仮名 だ", "アイ は 片仮名 だ"],
  ["K", "今深海魚を数えたところだ", "今 深海 魚 を 数え た ところ だ", "今深海魚 を 数え た ところ だ"],
  ["O", "＊＃は記号だ", "＊ ＃ は 記号 だ", "＊＃ は 記号 だ"],
];

/**
 * Assertions, implemented once so every runtime checks exactly the same thing.
 * They just throw; each runtime's test framework reports the failure.
 */
export const asserts = {
  eq(actual, expected, message) {
    if (!Object.is(actual, expected)) {
      throw new Error(
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${message ? ` (${message})` : ""}`,
      );
    }
  },
  ok(value, message) {
    if (!value) throw new Error(`expected truthy${message ? ` (${message})` : ""}`);
  },
  throws(body, pattern, message) {
    let threw = false;
    try {
      body();
    } catch (e) {
      threw = true;
      if (pattern && !pattern.test(String(e && e.message))) {
        throw new Error(`error did not match ${pattern}: ${e && e.message}${message ? ` (${message})` : ""}`);
      }
    }
    if (!threw) throw new Error(`expected a throw${message ? ` (${message})` : ""}`);
  },
};

/**
 * @param {object} ctx
 * @param {any} ctx.Vaporetto        the exported class
 * @param {Uint8Array} ctx.model     tests/fixtures/tiny.model
 * @param {Uint8Array} ctx.modelZst  tests/fixtures/tiny.model.zst
 * @param {string} ctx.vaporettoVersion
 * @param {string} ctx.jsVaporettoVersion
 * @returns {Array<{name: string, fn: (t: {eq: Function, ok: Function, throws: Function}) => void}>}
 */
export function createSuite({ Vaporetto, model, modelZst, vaporettoVersion, jsVaporettoVersion }) {
  /** Run `body` with a tokenizer that is always freed afterwards. */
  const with_ = (options, body) => {
    const t = options === undefined ? Vaporetto.fromModel(model) : Vaporetto.fromModel(model, options);
    try {
      return body(t);
    } finally {
      t.free();
    }
  };

  return [
    {
      name: "versions are exposed as plain strings",
      fn: (t) => {
        t.eq(vaporettoVersion, "0.6.5");
        t.ok(/^\d+\.\d+\.\d+$/.test(jsVaporettoVersion), `js version looks like semver: ${jsVaporettoVersion}`);
      },
    },

    {
      name: "tokenizeToString splits the fixture sentences",
      fn: (t) =>
        with_(undefined, (v) => {
          t.eq(v.tokenizeToString("ここは静かなところだ"), "ここ は 静か な ところ だ");
          t.eq(v.tokenizeToString("今深海魚を数えたところだ"), "今 深海 魚 を 数え た ところ だ");
          t.eq(v.tokenizeToString("青い空を鳥が飛ぶ"), "青い 空 を 鳥 が 飛ぶ");
        }),
    },

    {
      name: "empty input yields an empty array and an empty string",
      fn: (t) =>
        with_(undefined, (v) => {
          t.eq(v.tokenize("").length, 0);
          t.eq(v.tokenizeToString(""), "");
          t.eq(JSON.stringify(v.tokenizeBatch(["", ""])), "[[],[]]");
        }),
    },

    {
      name: "tokens are plain objects, not wasm-backed class instances",
      fn: (t) =>
        with_(undefined, (v) => {
          const tok = v.tokenize("青い空を鳥が飛ぶ")[0];
          t.eq(Object.getPrototypeOf(tok), Object.prototype);
          t.eq(typeof tok.free, "undefined");
          t.eq(Object.keys(tok).sort().join(","), "end,start,surface,tags");
        }),
    },

    // --- the core invariant --------------------------------------------------
    ...GRAPHEMES.flatMap(([label, grapheme]) =>
      [
        ["alone", grapheme],
        ["at the start", grapheme + "今深海魚を数えた"],
        ["at the end", "今深海魚を数えた" + grapheme],
        ["in the middle", "今深海" + grapheme + "魚を数えた"],
      ].flatMap(([position, text]) =>
        [{}, { normalize: false }, { wsConst: "G" }, { predictTags: true }].map((options) => ({
          name: `slice(start, end) === surface — ${label} ${position} ${JSON.stringify(options)}`,
          fn: (t) =>
            with_(options, (v) => {
              const tokens = v.tokenize(text);
              t.ok(tokens.length > 0, "produced at least one token");
              for (const tok of tokens) {
                t.eq(text.slice(tok.start, tok.end), tok.surface);
              }
              t.eq(tokens.map((x) => x.surface).join(""), text);
              // offsets must be contiguous and cover the whole input
              t.eq(tokens[0].start, 0);
              t.eq(tokens[tokens.length - 1].end, text.length);
              for (let i = 1; i < tokens.length; i++) t.eq(tokens[i].start, tokens[i - 1].end);
            }),
        })),
      ),
    ),

    {
      // Normalization turns half-width into full-width, which changes the UTF-8
      // byte length of the text the model actually sees. Offsets must still
      // refer to the original string.
      name: "offsets survive half-width to full-width normalization",
      fn: (t) =>
        with_(undefined, (v) => {
          const text = "abc123今深海魚";
          const tokens = v.tokenize(text);
          for (const tok of tokens) t.eq(text.slice(tok.start, tok.end), tok.surface);
          t.eq(tokens.map((x) => x.surface).join(""), text);
        }),
    },

    // --- tags ----------------------------------------------------------------
    {
      name: "predictTags false leaves tags empty",
      fn: (t) =>
        with_({ predictTags: false }, (v) => {
          for (const tok of v.tokenize("ここは静かなところだ")) t.eq(tok.tags.length, 0);
        }),
    },

    {
      name: "predictTags true returns part of speech and reading",
      fn: (t) =>
        with_({ predictTags: true }, (v) => {
          const a = v.tokenize("ここは静かなところだ");
          t.eq(a.map((x) => x.tags[0]).join("/"), "代名詞/助詞/形容動詞/助動詞/名詞/助動詞");
          t.eq(a.map((x) => x.tags[1]).join("/"), "ココ/ワ/シズカ/ナ/トコロ/ダ");
          t.eq(
            v.tokenizeToString("ここは静かなところだ"),
            "ここ/代名詞/ココ は/助詞/ワ 静か/形容動詞/シズカ な/助動詞/ナ ところ/名詞/トコロ だ/助動詞/ダ",
          );
        }),
    },

    {
      // Proves the tag classifier is really running rather than returning a
      // fixed tag: the same surface gets a different tag in each sentence.
      name: "the same surface is tagged differently depending on context",
      fn: (t) =>
        with_({ predictTags: true }, (v) => {
          const a = v.tokenize("ここは静かなところだ");
          const b = v.tokenize("今深海魚を数えたところだ");
          t.eq(a.find((x) => x.surface === "ところ").tags[0], "名詞");
          t.eq(b.find((x) => x.surface === "ところ").tags[0], "助詞");
        }),
    },

    // --- wsConst -------------------------------------------------------------
    ...WS_CONST_CASES.flatMap(([ch, text, whenEmpty, whenSet]) => [
      {
        name: `wsConst "" leaves ${ch}-type characters split`,
        fn: (t) => with_(undefined, (v) => t.eq(v.tokenizeToString(text), whenEmpty)),
      },
      {
        name: `wsConst "${ch}" merges ${ch}-type characters`,
        fn: (t) => with_({ wsConst: ch }, (v) => t.eq(v.tokenizeToString(text), whenSet)),
      },
      {
        name: `wsConst "${ch}" does not affect other character types`,
        fn: (t) =>
          with_({ wsConst: ch }, (v) => {
            for (const [other, otherText, otherWhenEmpty] of WS_CONST_CASES) {
              if (other === ch || otherText === text) continue;
              t.eq(v.tokenizeToString(otherText), otherWhenEmpty);
            }
          }),
      },
    ]),

    ...GRAPHEMES.filter(([, g]) => [...g].length > 1).map(([label, grapheme]) => ({
      name: `wsConst "G" joins ${label} into one token`,
      fn: (t) => {
        with_(undefined, (v) => t.eq(v.tokenize(grapheme).length, [...grapheme].length));
        with_({ wsConst: "G" }, (v) => {
          const tokens = v.tokenize(grapheme);
          t.eq(tokens.length, 1);
          t.eq(tokens[0].surface, grapheme);
        });
      },
    })),

    {
      name: "wsConst accepts every documented character and combinations",
      fn: (t) => {
        for (const ch of ["D", "R", "H", "T", "K", "O", "G", "DGR", "DRHTKOG", ""]) {
          with_({ wsConst: ch }, (v) => t.ok(typeof v.tokenizeToString("青い空を鳥が飛ぶ") === "string"));
        }
      },
    },

    {
      name: "an unknown wsConst character throws",
      fn: (t) => t.throws(() => Vaporetto.fromModel(model, { wsConst: "X" }), /invalid wsConst/),
    },

    // --- model loading -------------------------------------------------------
    {
      name: "fromCompressedModel reads a zstd model",
      fn: (t) => {
        const v = Vaporetto.fromCompressedModel(modelZst);
        try {
          t.eq(v.tokenizeToString("青い空を鳥が飛ぶ"), "青い 空 を 鳥 が 飛ぶ");
        } finally {
          v.free();
        }
      },
    },

    {
      name: "fromCompressedModel rejects uncompressed bytes",
      fn: (t) => t.throws(() => Vaporetto.fromCompressedModel(model)),
    },

    {
      name: "fromModel rejects a compressed model",
      fn: (t) => t.throws(() => Vaporetto.fromModel(modelZst)),
    },

    {
      // The dangerous case: Model::read_slice indexes &slice[..25] with no
      // bounds check, so an empty array would abort the whole wasm module.
      // We use Model::read instead, which returns Err.
      name: "malformed model bytes throw instead of aborting the module",
      fn: (t) => {
        for (const len of [0, 1, 3, 24, 25, 64, 1000]) {
          t.throws(() => Vaporetto.fromModel(new Uint8Array(len)), undefined, `length ${len}`);
        }
        // the module must still be usable afterwards
        with_(undefined, (v) => t.eq(v.tokenizeToString("青い空を鳥が飛ぶ"), "青い 空 を 鳥 が 飛ぶ"));
      },
    },

    // --- options -------------------------------------------------------------
    {
      name: "options default to predictTags false, wsConst '', normalize true",
      fn: (t) => {
        const explicit = Vaporetto.fromModel(model, { predictTags: false, wsConst: "", normalize: true });
        try {
          with_(undefined, (v) =>
            t.eq(v.tokenizeToString("abc123今深海魚"), explicit.tokenizeToString("abc123今深海魚")),
          );
        } finally {
          explicit.free();
        }
      },
    },

    {
      name: "undefined and null options are accepted",
      fn: (t) => {
        for (const options of [undefined, null]) {
          const v = Vaporetto.fromModel(model, options);
          try {
            t.eq(v.tokenizeToString("青い空を鳥が飛ぶ"), "青い 空 を 鳥 が 飛ぶ");
          } finally {
            v.free();
          }
        }
      },
    },

    {
      name: "an option with the wrong value type throws",
      fn: (t) => {
        t.throws(() => Vaporetto.fromModel(model, { predictTags: "yes" }));
        t.throws(() => Vaporetto.fromModel(model, { wsConst: 1 }));
        t.throws(() => Vaporetto.fromModel(model, { normalize: 0 }));
      },
    },

    // --- input validation ----------------------------------------------------
    {
      name: "a NUL character in the input throws",
      fn: (t) =>
        with_(undefined, (v) => {
          t.throws(() => v.tokenize("あ\0い"), /NULL/i);
          t.throws(() => v.tokenizeToString("あ\0い"), /NULL/i);
          t.throws(() => v.tokenizeBatch(["ok", "あ\0い"]), /NULL/i);
        }),
    },

    // --- batch ---------------------------------------------------------------
    {
      name: "tokenizeBatch matches tokenize element by element",
      fn: (t) =>
        with_({ predictTags: true }, (v) => {
          const texts = ["ここは静かなところだ", "", "今深海魚を数えたところだ", "\u{29E3D}を数えた"];
          const batch = v.tokenizeBatch(texts);
          t.eq(batch.length, texts.length);
          for (let i = 0; i < texts.length; i++) {
            t.eq(JSON.stringify(batch[i]), JSON.stringify(v.tokenize(texts[i])));
          }
        }),
    },

    // --- lifetime ------------------------------------------------------------
    {
      name: "calling a method after free() throws instead of crashing wasm",
      fn: (t) => {
        const v = Vaporetto.fromModel(model);
        v.free();
        t.throws(() => v.tokenize("あ"), /null pointer/);
        t.throws(() => v.tokenizeToString("あ"), /null pointer/);
        t.throws(() => v.tokenizeBatch(["あ"]), /null pointer/);
        // a fresh instance still works, so the module was not torn down
        with_(undefined, (w) => t.eq(w.tokenizeToString("青い空を鳥が飛ぶ"), "青い 空 を 鳥 が 飛ぶ"));
      },
    },

    {
      name: "free() is idempotent",
      fn: (t) => {
        const v = Vaporetto.fromModel(model);
        v.free();
        v.free();
        t.ok(true);
      },
    },

    {
      name: "Symbol.dispose is implemented and frees on scope exit",
      fn: (t) => {
        t.eq(typeof Vaporetto.prototype[Symbol.dispose], "function");
        let escaped;
        {
          const v = Vaporetto.fromModel(model);
          escaped = v;
          t.eq(v.tokenizeToString("青い空を鳥が飛ぶ"), "青い 空 を 鳥 が 飛ぶ");
          v[Symbol.dispose]();
        }
        t.throws(() => escaped.tokenize("あ"), /null pointer/);
      },
    },
  ];
}
