const stripTags = (value: string): string =>
    String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/**
 * Search handler of the built-in `openserp` web search provider.
 *
 * Asks DuckDuckGo first, then Bing once on failure or no usable results, with 10 seconds per request and a
 * 20-second total budget; reports the backend used as `sourceEngine`. Called by websearch.search; agents should
 * call websearch.search with `engine: "openserp"` instead.
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
    const { query, limit } = opts;
    const endpoint = await ctx.fns.websearch.openserpEndpoint({});
    if (!endpoint) throw ctx.fns.websearch.providerError({ message: 'openserpEndpoint must be an HTTP(S) base URL without credentials, query or fragment' });
    const deadline = performance.now() + 20_000;
    const failures: string[] = [];
    for (const provider of ['duckduckgo', 'bing'] as const) {
        const controller = new AbortController();
        const remaining = Math.min(10_000, Math.max(0, deadline - performance.now()));
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const url = new URL(`${endpoint.href.replace(/\/$/, '')}/${provider}/search`);
            url.searchParams.set('text', query);
            url.searchParams.set('limit', String(limit));
            const request = async (): Promise<types.websearch.SearchResult[]> => {
                const response = await fetch(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data: unknown = await response.json();
                if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results)) {
                    throw new Error('invalid response shape');
                }
                const normalized: types.websearch.SearchResult[] = [];
                const seen = new Set<string>();
                for (const item of data.results) {
                    if (!item || typeof item !== 'object' || item.type !== 'organic' || item.engine !== provider ||
                        typeof item.title !== 'string' || typeof item.url !== 'string' ||
                        (item.snippet !== undefined && typeof item.snippet !== 'string')) continue;
                    let link: URL;
                    try { link = new URL(item.url); } catch { continue; }
                    if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password) continue;
                    link.hash = '';
                    const title = stripTags(item.title);
                    if (!title || seen.has(link.href)) continue;
                    seen.add(link.href);
                    normalized.push({ title, url: link.href, description: stripTags(item.snippet ?? ''),
                        descriptionHtml: null, publishedAt: null, language: null, site: null, extraSnippets: [] });
                    if (normalized.length >= limit) break;
                }
                if (!normalized.length) throw new Error('no usable results');
                return normalized;
            };
            const results = await Promise.race([
                request(),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => { controller.abort(); reject(new Error('request timed out')); }, remaining);
                }),
            ]);
            return { results, sourceEngine: provider };
        } catch (error) {
            // Never expose response bodies, query-bearing transport errors or fabricated results.
            const message = error instanceof Error ? error.message : '';
            failures.push(`${provider}: ${/^(HTTP \d{3}|invalid response shape|no usable results|request timed out)$/.test(message) ? message : 'request failed'}`);
        } finally {
            clearTimeout(timer);
            controller.abort();
        }
    }
    throw ctx.fns.websearch.providerError({ message: `OpenSERP failed (${failures.join('; ')})` });
}
