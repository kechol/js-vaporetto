/* tslint:disable */
/* eslint-disable */

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
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * zstd 圧縮されたモデルから生成する。
     */
    static fromCompressedModel(model: Uint8Array, options?: VaporettoOptions | null): Vaporetto;
    /**
     * KyTea モデルから生成する。タグ予測は非対応。
     */
    static fromKyteaModel(model: Uint8Array, options?: Omit<VaporettoOptions, "predictTags"> | null): Vaporetto;
    /**
     * 非圧縮の Vaporetto モデルから生成する。
     */
    static fromModel(model: Uint8Array, options?: VaporettoOptions | null): Vaporetto;
    /**
     * トークン列を返す。`start` / `end` は UTF-16 コード単位。
     */
    tokenize(text: string): Token[];
    /**
     * 文字列コピーのオーバーヘッドを償却するためのバッチ版。
     */
    tokenizeBatch(texts: string[]): Token[][];
    /**
     * 分かち書き結果を文字列で返す。区切りは半角スペース。
     * タグ予測が有効なときはタグが `/` 区切りで付く。
     */
    tokenizeToString(text: string): string;
}

/**
 * js-vaporetto 自身のバージョン（ラッパ生成用）。
 */
export function __jsVaporettoVersion(): string;

/**
 * 依存している Vaporetto のバージョン（ラッパ生成用）。
 */
export function __vaporettoVersion(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __jsVaporettoVersion: () => [number, number];
    readonly __vaporettoVersion: () => [number, number];
    readonly __wbg_vaporetto_free: (a: number, b: number) => void;
    readonly vaporetto_fromCompressedModel: (a: number, b: number, c: number) => [number, number, number];
    readonly vaporetto_fromKyteaModel: (a: number, b: number, c: number) => [number, number, number];
    readonly vaporetto_fromModel: (a: number, b: number, c: number) => [number, number, number];
    readonly vaporetto_tokenize: (a: number, b: number, c: number) => [number, number, number];
    readonly vaporetto_tokenizeBatch: (a: number, b: any) => [number, number, number];
    readonly vaporetto_tokenizeToString: (a: number, b: number, c: number) => [number, number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
