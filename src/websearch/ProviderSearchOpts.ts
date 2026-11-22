/** Arguments websearch core passes to a provider's search handler. */
export type ProviderSearchOpts = {
    /** Trimmed, non-empty query. */
    query: string;
    /** Requested result count, already clamped to 1..20. */
    limit: number;
};
