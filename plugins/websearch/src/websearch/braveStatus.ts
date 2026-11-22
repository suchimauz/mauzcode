/**
 * Status handler of the built-in `brave` web search provider: configured when `websearch.braveApiKey` resolves.
 *
 * Makes no network request and never reveals the key.
 */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<types.websearch.ProviderStatus> {
    const configured = Boolean((await ctx.fns.secrets.resolveSetting({ module: 'websearch', key: 'braveApiKey' }).catch(() => null))?.trim());
    return configured ? { configured: true } : { configured: false, reason: 'API key not set' };
}
