// Compile-time only: `tsc --noEmit --strict` must accept this file. It is never
// executed. Its job is to prove the generated .d.ts exposes the documented
// shapes rather than `any` or `JsValue`.
import {
  Vaporetto,
  type Token,
  type VaporettoOptions,
  VAPORETTO_VERSION,
  JS_VAPORETTO_VERSION,
} from "js-vaporetto";

declare const bytes: Uint8Array;

const versions: string[] = [VAPORETTO_VERSION, JS_VAPORETTO_VERSION];

const options: VaporettoOptions = { predictTags: true, wsConst: "DGR", normalize: false };
const empty: VaporettoOptions = {};

const tokenizer: Vaporetto = Vaporetto.fromModel(bytes, options);
const withoutOptions: Vaporetto = Vaporetto.fromModel(bytes);
const fromZstd: Vaporetto = Vaporetto.fromCompressedModel(bytes, empty);

// fromKyteaModel must not accept predictTags: KyTea models carry no tag data.
const fromKytea: Vaporetto = Vaporetto.fromKyteaModel(bytes, { wsConst: "K", normalize: true });
// @ts-expect-error predictTags is omitted from the KyTea options type
Vaporetto.fromKyteaModel(bytes, { predictTags: true });

const tokens: Token[] = tokenizer.tokenize("あ");
const surface: string = tokens[0].surface;
const start: number = tokens[0].start;
const end: number = tokens[0].end;
const tag: string | null = tokens[0].tags[0];

const batch: Token[][] = tokenizer.tokenizeBatch(["あ", "い"]);
const joined: string = tokenizer.tokenizeToString("あ");

// @ts-expect-error tokenize takes a string, not a number
tokenizer.tokenize(1);
// @ts-expect-error wsConst is a string
Vaporetto.fromModel(bytes, { wsConst: 1 });
// @ts-expect-error Vaporetto has no public constructor; use the factories
new Vaporetto();

tokenizer.free();
tokenizer[Symbol.dispose]();

export type { Token, VaporettoOptions };
export {
  versions,
  options,
  empty,
  withoutOptions,
  fromZstd,
  fromKytea,
  surface,
  start,
  end,
  tag,
  batch,
  joined,
};
