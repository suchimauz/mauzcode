/** Public pay-as-you-go list price of one model, USD per million tokens; an API-equivalent estimate, not a bill. */
export type TokenPrice = {
    /** Uncached input tokens. */
    input: number;
    /** Output tokens. */
    output: number;
    /** Cache-read input tokens; null when the catalogue lists no cache price. */
    cacheRead: number | null;
    /** Cache-write input tokens; null when the catalogue lists no cache price. */
    cacheWrite: number | null;
};
