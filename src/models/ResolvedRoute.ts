/** Network-free route resolution using current connection state and cached catalogue limits. */
export type ResolvedRoute = types.models.ModelRoute & {
    /** Original route, preserved exactly. */
    route: string;
    /** Provider-native model id for stream/call options. */
    model: string;
    /** Stored connection UUID. */
    connectionId: string;
    /** Provider supports native transcript compaction. */
    nativeCompaction: boolean;
    /** Optional provider identity instructions, absent when not declared. */
    systemPreamble?: string;
    /** Optional public price catalogue vendor, absent when not declared. */
    priceVendor?: string;
    /** Effective local context budget: owner override, else cached provider metadata, else public catalogue; absent when none exists. */
    contextWindow?: number;
    /** Effective context limit with provenance (override, provider, catalog or 200000 fallback); raw provider metadata stays in `provider`. */
    contextLimit?: types.models.ContextLimit;
    /** Maximum output token budget: cached provider metadata, else public catalogue. */
    maxOutputTokens?: number;
};
