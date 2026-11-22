/**
 * Search handler of the built-in `google-browser` web search provider: Google in the user's browser.
 *
 * Called by websearch.search; agents should call websearch.search with `engine: "google-browser"` instead, which
 * normalizes and bounds the results.
 * @param opts.query Trimmed, non-empty query.
 * @param opts.limit Requested result count, already clamped to 1..20.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Trimmed, non-empty query. */
        query: string;
        /** Requested result count, already clamped to 1..20. */
        limit: number;
    },
): Promise<types.websearch.ProviderSearchResult> {
    const response = await ctx.fns.browser.googleSearch({ query: opts.query, count: opts.limit, session: `websearch-${Date.now()}` });
    return {
        results: response.results.map((item: { title: string; url: string; snippet?: string }) => ({
            title: item.title, url: item.url, description: item.snippet ?? '',
        })),
    };
}
