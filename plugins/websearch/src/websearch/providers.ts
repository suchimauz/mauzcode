/**
 * Lists registered web search providers with their configuration status, the default engine first.
 *
 * Use it to pick an `engine` for websearch.search or websearch.answer: `configured: false` means a search with
 * that provider fails now (see `reason`, for example a missing `websearch.braveApiKey`). Status checks run in
 * parallel, each bounded to 2 seconds; a failing or slow one marks only that provider as not configured.
 */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<Array<{
    /** Provider id accepted as `engine`. */
    id: string;
    label: string;
    description: string;
    /** Mounted module or plugin that declared it. */
    owner: string;
    /** Whether a search with this provider can run now. */
    configured: boolean;
    /** Why it is not configured, when it is not. */
    reason?: string;
    /** Whether it is the `websearch.defaultEngine` setting. */
    isDefault: boolean;
}>> {
    const providers = Object.values(ctx.state.websearch?.providers ?? {});
    const defaultEngine = await ctx.fns.settings.getString({ module: 'websearch', scopeType: 'global', key: 'defaultEngine', fallback: 'google-browser' });
    const listed = await Promise.all(providers.map(async provider => {
        const status = await ctx.fns.websearch.providerStatus({ id: provider.id });
        return {
            id: provider.id, label: provider.label, description: provider.description, owner: provider.owner,
            configured: status.configured, ...(status.reason ? { reason: status.reason } : {}),
            isDefault: provider.id === defaultEngine,
        };
    }));
    return listed.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id.localeCompare(b.id));
}
