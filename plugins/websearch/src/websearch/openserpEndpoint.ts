/**
 * Returns the validated OpenSERP base URL from `websearch.openserpEndpoint`, or null when it is not usable.
 *
 * The endpoint must be an HTTP(S) base URL without credentials, query or fragment.
 */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<URL | null> {
    const raw = await ctx.fns.settings.getString({
        module: 'websearch', scopeType: 'global', key: 'openserpEndpoint', fallback: 'http://127.0.0.1:7000',
    }) ?? 'http://127.0.0.1:7000';
    let endpoint: URL;
    try { endpoint = new URL(raw); } catch { return null; }
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null;
    return endpoint;
}
