/* tslint:disable */
/* eslint-disable */

export class Vaporetto {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * 非圧縮の Vaporetto モデルから生成する。
     *
     * `Model::read_slice` ではなく `Model::read` を使う。前者は先頭 25 バイトを
     * 境界チェックなしにスライスするため、25 バイト未満の入力で panic する。
     * `&[u8]` は `std::io::Read` を実装しているので、後者なら安全に `Err` が返る。
     */
    static fromModel(model: Uint8Array): Vaporetto;
    /**
     * 分かち書き結果を文字列で返す。区切りは半角スペース。
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
