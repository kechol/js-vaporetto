// Benchmark harness. Point it at a built dist/node directory and a model.
//
//   node bench/run.mjs [--dist DIR] [--model FILE] [--lines N] [--json]
//
// Measures the two things that matter for this binding:
//   * model load time — Predictor::new dominates it, and charwise-pma is
//     documented upstream as making it slower
//   * per-call vs batched tokenization — wasm-bindgen re-encodes every string
//     from UTF-16 to UTF-8 and copies it across the boundary on each call, so
//     the crossing itself can cost more than the tokenization
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const DIST = resolve(arg("--dist", "dist/node"));
const MODEL = resolve(arg("--model", "tests/fixtures/tiny.model"));
const LINES = Number(arg("--lines", "5000"));
const CORPUS = arg("--corpus", null);
const AS_JSON = args.includes("--json");

const require = createRequire(import.meta.url);
const { Vaporetto } = require(`${DIST}/vaporetto.js`);
const modelBytes = new Uint8Array(readFileSync(MODEL));

// Input: a real corpus if one is given, otherwise repeat the fixture sentences.
let texts;
if (CORPUS) {
  texts = readFileSync(resolve(CORPUS), "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, LINES);
} else {
  const seed = ["ここは静かなところだ", "今深海魚を数えたところだ", "青い空を鳥が飛ぶ"];
  texts = Array.from({ length: LINES }, (_, i) => seed[i % seed.length]);
}
const chars = texts.reduce((n, s) => n + s.length, 0);

const time = (fn) => {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
};

const best = (runs, fn) => {
  let ms = Infinity;
  for (let i = 0; i < runs; i++) ms = Math.min(ms, time(fn).ms);
  return ms;
};

// --- model load --------------------------------------------------------------
const loads = [];
for (let i = 0; i < 5; i++) {
  const { ms, value } = time(() => Vaporetto.fromModel(modelBytes, { predictTags: false }));
  loads.push(ms);
  value.free();
}
const loadMs = Math.min(...loads);

const tokenizer = Vaporetto.fromModel(modelBytes, { predictTags: false });
const tagging = Vaporetto.fromModel(modelBytes, { predictTags: true });

// warm up so the first-call JIT cost is not attributed to one of the variants
for (let i = 0; i < 200; i++) tokenizer.tokenize(texts[i % texts.length]);

const perCallMs = best(3, () => {
  for (const text of texts) tokenizer.tokenize(text);
});
const batchMs = best(3, () => tokenizer.tokenizeBatch(texts));
const toStringMs = best(3, () => {
  for (const text of texts) tokenizer.tokenizeToString(text);
});
const taggedPerCallMs = best(3, () => {
  for (const text of texts) tagging.tokenize(text);
});
const taggedBatchMs = best(3, () => tagging.tokenizeBatch(texts));

const tokens = tokenizer.tokenizeBatch(texts).reduce((n, t) => n + t.length, 0);
tokenizer.free();
tagging.free();

const result = {
  dist: DIST,
  model: MODEL,
  modelBytes: modelBytes.length,
  lines: texts.length,
  chars,
  tokens,
  loadMs: +loadMs.toFixed(2),
  perCallMs: +perCallMs.toFixed(2),
  batchMs: +batchMs.toFixed(2),
  toStringMs: +toStringMs.toFixed(2),
  taggedPerCallMs: +taggedPerCallMs.toFixed(2),
  taggedBatchMs: +taggedBatchMs.toFixed(2),
  batchSpeedup: +(perCallMs / batchMs).toFixed(2),
  charsPerSecPerCall: Math.round((chars / perCallMs) * 1000),
  charsPerSecBatch: Math.round((chars / batchMs) * 1000),
};

if (AS_JSON) {
  console.log(JSON.stringify(result));
} else {
  const pad = (s) => String(s).padStart(12);
  console.log(`dist            ${DIST}`);
  console.log(`model           ${MODEL} (${modelBytes.length.toLocaleString()} bytes)`);
  console.log(`input           ${texts.length.toLocaleString()} lines / ${chars.toLocaleString()} chars / ${tokens.toLocaleString()} tokens`);
  console.log(`load            ${pad(result.loadMs)} ms`);
  console.log(`tokenize        ${pad(result.perCallMs)} ms   ${result.charsPerSecPerCall.toLocaleString()} chars/s`);
  console.log(`tokenizeBatch   ${pad(result.batchMs)} ms   ${result.charsPerSecBatch.toLocaleString()} chars/s   (${result.batchSpeedup}x)`);
  console.log(`tokenizeToString${pad(result.toStringMs)} ms`);
  console.log(`tokenize +tags  ${pad(result.taggedPerCallMs)} ms`);
  console.log(`batch    +tags  ${pad(result.taggedBatchMs)} ms`);
}
