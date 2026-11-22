const stripTags = (value: string): string =>
    String(value ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;

/**
 * Searches the public web through a registered provider and returns normalized ranked links.
 *
 * Use this for retrieval-only web discovery. It does not open result pages or ask an LLM to summarize them.
 * Built-in providers: `google-browser` (Google in the user's browser), `openserp` (operator-run OpenSERP:
 * DuckDuckGo, then Bing once) and `brave` (Brave Search API, needs `websearch.braveApiKey`); plugins may add
 * more — list them with websearch.providers. The engine is the `engine` argument, otherwise the
 * `websearch.defaultEngine` setting. An unknown or unconfigured engine fails with a clear error; websearch never
 * switches to another provider. Results are normalized for every provider: HTTP(S) URLs only, no credentials or
 * fragments, no duplicates, markup stripped from `title`/`description`, missing fields null or empty. `publishedAt`
 * tells whether a page is current and `extraSnippets` often answers the question without opening the page.
 * Page reading in websearch.answer/fetch still needs the browser.
 *
 * @param opts.query Search query sent to the selected engine.
 * @param opts.limit Maximum number of ranked results to return. @default 10 @minimum 1 @maximum 20
 * @param opts.engine Registered provider id (`google-browser`, `openserp`, `brave` or a plugin's); when omitted, uses the `websearch.defaultEngine` setting.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Search query sent to the selected engine. */
        query: string;
        /** Maximum number of ranked results to return. @default 10 @minimum 1 @maximum 20 */
        limit?: number;
        /** Registered provider id (`google-browser`, `openserp`, `brave` or a plugin's); when omitted, uses the `websearch.defaultEngine` setting. */
        engine?: string;
    },
): Promise<{ query: string; engine: string; /** Backend used behind the provider (OpenSERP: `duckduckgo` or `bing`), when it reports one. */ sourceEngine?: string; results: types.websearch.SearchResult[]; durationMs: number }> {
    const query = String(opts.query ?? '').trim();
    if (!query) throw new Error('websearch.search: query is required');
    const limit = Math.max(1, Math.min(20, Math.trunc(Number(opts.limit ?? 10)) || 1));
    const engine = String(opts.engine ?? await ctx.fns.settings.getString({
        module: 'websearch', scopeType: 'global', key: 'defaultEngine', fallback: 'google-browser',
    }) ?? 'google-browser');
    const providers = ctx.state.websearch?.providers ?? {};
    const provider = Object.hasOwn(providers, engine) ? providers[engine] : undefined;
    if (!provider) {
        throw new Error(`websearch.search: unknown engine ${engine.slice(0, 100)} (available: ${Object.keys(providers).sort().join(', ') || 'none'})`);
    }
    const status = await ctx.fns.websearch.providerStatus({ id: engine });
    if (!status.configured) {
        if (status.reason === 'handler unavailable') throw new Error(`websearch.search: ${engine}: handler unavailable`);
        const hint = provider.settings.length ? `; set ${provider.settings.join(', ')}` : '';
        throw new Error(`websearch.search: engine ${engine} is not configured (${status.reason ?? 'not configured'}${hint})`);
    }
    const handler = provider.handlers.search.split('.').reduce((node: any, key) => node?.[key], ctx.fns as any);
    if (typeof handler !== 'function') throw new Error(`websearch.search: ${engine}: handler unavailable`);

    const startedAt = performance.now();
    let raw: unknown;
    try {
        raw = await handler({ query, limit });
    } catch (error) {
        // Whitelist: only errors made by websearch.providerError carry a message callers may see.
        const safe = error instanceof Error && error.name === 'WebsearchProviderError' ? error.message.slice(0, 200) : '';
        throw new Error(`websearch.search: ${engine}: ${safe || 'request failed'}`);
    }
    const items = raw && typeof raw === 'object' && Array.isArray((raw as { results?: unknown }).results) ? (raw as { results: unknown[] }).results : null;
    if (!items) throw new Error(`websearch.search: ${engine}: invalid response shape`);
    const sourceEngine = text((raw as { sourceEngine?: unknown }).sourceEngine)?.slice(0, 50);

    const results: types.websearch.SearchResult[] = [];
    const seen = new Set<string>();
    for (const item of items) {
        if (results.length >= limit) break;
        if (!item || typeof item !== 'object') continue;
        const r = item as Record<string, unknown>;
        if (typeof r.url !== 'string' || typeof r.title !== 'string') continue;
        let link: URL;
        try { link = new URL(r.url); } catch { continue; }
        if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password) continue;
        link.hash = '';
        if (seen.has(link.href)) continue;
        seen.add(link.href);
        results.push({
            title: stripTags(r.title),
            url: link.href,
            description: stripTags(typeof r.description === 'string' ? r.description : ''),
            descriptionHtml: text(r.descriptionHtml),
            publishedAt: text(r.publishedAt),
            language: text(r.language),
            site: text(r.site),
            extraSnippets: Array.isArray(r.extraSnippets) ? r.extraSnippets.filter((s): s is string => typeof s === 'string' && !!s.trim()) : [],
        });
    }

    return {
        query,
        engine,
        ...(sourceEngine ? { sourceEngine } : {}),
        results,
        durationMs: Math.round(performance.now() - startedAt),
    };
}
