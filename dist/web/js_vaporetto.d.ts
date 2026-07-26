/* tslint:disable */
/* eslint-disable */

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



export class Vaporetto {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Creates a tokenizer from a zstd-compressed model.
     */
    static fromCompressedModel(model: Uint8Array, options?: VaporettoOptions | null): Vaporetto;
    /**
     * Creates a tokenizer from a KyTea model. Tag prediction is not supported.
     */
    static fromKyteaModel(model: Uint8Array, options?: Omit<VaporettoOptions, "predictTags"> | null): Vaporetto;
    /**
     * Creates a tokenizer from an uncompressed Vaporetto model.
     */
    static fromModel(model: Uint8Array, options?: VaporettoOptions | null): Vaporetto;
    /**
     * Tokenizes `text`. `start` and `end` are UTF-16 code unit offsets.
     */
    tokenize(text: string): Token[];
    /**
     * Batched form of `tokenize`.
     *
     * Measured against a real model this is not faster than calling `tokenize`
     * in a loop; see the benchmark section of the README before reaching for it.
     */
    tokenizeBatch(texts: string[]): Token[][];
    /**
     * Returns the tokenization as a string, tokens separated by a single
     * space. With tag prediction enabled, tags follow each token after a `/`.
     */
    tokenizeToString(text: string): string;
}

/**
 * Version of js-vaporetto itself. Used to generate the JS wrapper.
 */
export function __jsVaporettoVersion(): string;

/**
 * Version of the Vaporetto crate this was built against. Used to generate the
 * JS wrapper.
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
