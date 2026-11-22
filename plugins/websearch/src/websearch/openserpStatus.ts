/**
 * Status handler of the built-in `openserp` web search provider; checks only that the endpoint setting parses.
 *
 * Makes no network request, so a configured provider may still fail when the service is down.
 */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<types.websearch.ProviderStatus> {
    return await ctx.fns.websearch.openserpEndpoint({})
        ? { configured: true }
        : { configured: false, reason: 'openserpEndpoint must be an HTTP(S) base URL without credentials, query or fragment' };
}
