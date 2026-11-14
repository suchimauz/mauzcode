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
    /** Cached context token budget; absent on an unknown model or cold cache. */
    contextWindow?: number;
    /** Cached maximum output token budget. */
    maxOutputTokens?: number;
};
