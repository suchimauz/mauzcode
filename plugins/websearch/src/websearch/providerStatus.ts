const STATUS_TIMEOUT_MS = 2_000;

/**
 * Checks whether one registered web search provider can search now, bounded to 2 seconds.
 *
 * Used by websearch.providers and before every websearch.search. A provider without a status handler counts as
 * configured; a missing handler function reports `handler unavailable`; a throwing status reports
 * `status check failed` and a slow one `status check timed out`. Reasons are cut to 200 characters.
 * @param opts.id Registered provider id.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Registered provider id. */
        id: string;
    },
): Promise<types.websearch.ProviderStatus> {
    const providers = ctx.state.websearch?.providers ?? {};
    const provider = Object.hasOwn(providers, opts.id) ? providers[opts.id] : undefined;
    if (!provider) return { configured: false, reason: 'unknown provider' };
    const lookup = (name: string) => name.split('.').reduce((node: any, key) => node?.[key], ctx.fns as any);
    if (typeof lookup(provider.handlers.search) !== 'function') return { configured: false, reason: 'handler unavailable' };
    if (!provider.handlers.status) return { configured: true };
    const status = lookup(provider.handlers.status);
    if (typeof status !== 'function') return { configured: false, reason: 'handler unavailable' };
    // AbortSignal.timeout keeps the bound off the global timer queue that provider handlers use for their own budgets.
    const signal = AbortSignal.timeout(STATUS_TIMEOUT_MS);
    let onAbort: (() => void) | undefined;
    try {
        const value: unknown = await Promise.race([
            Promise.resolve().then(() => status({})),
            new Promise((_, reject) => {
                onAbort = () => reject(Object.assign(new Error('timeout'), { timeout: true }));
                if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
            }),
        ]);
        if (!value || typeof value !== 'object' || typeof (value as any).configured !== 'boolean') {
            return { configured: false, reason: 'status check failed' };
        }
        const { configured, reason } = value as { configured: boolean; reason?: unknown };
        if (configured) return { configured: true };
        return { configured: false, reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : 'not configured' };
    } catch (error) {
        return { configured: false, reason: (error as { timeout?: boolean })?.timeout ? 'status check timed out' : 'status check failed' };
    } finally {
        if (onAbort) signal.removeEventListener('abort', onAbort);
    }
}
