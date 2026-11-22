/** What a provider's search handler returns; core normalizes the items before callers see them. */
export type ProviderSearchResult = {
    /** Raw results; fields may be partial, invalid items are dropped by core. */
    results: Array<Partial<types.websearch.SearchResult> & { title?: unknown; url?: unknown }>;
    /** Backend actually used behind the provider (for example `duckduckgo` or `bing` for OpenSERP). */
    sourceEngine?: string;
};
