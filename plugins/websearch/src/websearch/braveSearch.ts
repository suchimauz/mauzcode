const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const TIMEOUT_MS = 10_000;

const stripTags = (value: string): string =>
    String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const str = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;

/**
 * Search handler of the built-in `brave` web search provider (Brave Search API, no browser).
 *
 * Sends one GET to the Brave web search endpoint with the key only in `X-Subscription-Token`, bounded to
 * 10 seconds, no retries or redirects. Fails with `invalid API key`, `rate limited`, `HTTP <code>`,
 * `invalid response shape`, `request timed out` or `request failed`, never with the body, key or URL. Called by
 * websearch.search; agents should call websearch.search with `engine: "brave"` instead.
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
    const fail = (message: string) => ctx.fns.websearch.providerError({ message });
    const key = (await ctx.fns.secrets.resolveSetting({ module: 'websearch', key: 'braveApiKey' }).catch(() => null))?.trim();
    if (!key) throw fail('API key not set');
    const url = new URL(ENDPOINT);
    url.searchParams.set('q', opts.query);
    url.searchParams.set('count', String(Math.max(1, Math.min(20, Math.trunc(opts.limit) || 10))));
    url.searchParams.set('extra_snippets', 'true');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let data: unknown;
    try {
        const request = async () => {
            const response = await fetch(url, {
                signal: controller.signal, redirect: 'error',
                headers: { Accept: 'application/json', 'X-Subscription-Token': key },
            });
            if (response.status === 401 || response.status === 403) throw fail('invalid API key');
            if (response.status === 429) throw fail('rate limited');
            if (!response.ok) throw fail(`HTTP ${response.status}`);
            try { return await response.json() as unknown; } catch { throw fail('invalid response shape'); }
        };
        data = await Promise.race([
            request(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => { timedOut = true; controller.abort(); reject(fail('request timed out')); }, TIMEOUT_MS);
            }),
        ]);
    } catch (error) {
        if (timedOut) throw fail('request timed out');
        if (error instanceof Error && error.name === 'WebsearchProviderError') throw error;
        throw fail('request failed');
    } finally {
        clearTimeout(timer);
        controller.abort();
    }
    const items = (data as { web?: { results?: unknown } } | null)?.web?.results;
    if (!Array.isArray(items)) throw fail('invalid response shape');
    const results: types.websearch.SearchResult[] = [];
    for (const item of items) {
        if (!item || typeof item !== 'object' || typeof item.title !== 'string' || typeof item.url !== 'string') continue;
        const html = str(item.description);
        const published = str(item.page_age) ? new Date(item.page_age) : null;
        results.push({
            title: item.title,
            url: item.url,
            description: stripTags(html ?? ''),
            descriptionHtml: html,
            publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
            language: str(item.language),
            site: str(item.profile?.name),
            extraSnippets: Array.isArray(item.extra_snippets) ? item.extra_snippets.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => stripTags(s)) : [],
        });
    }
    return { results };
}
