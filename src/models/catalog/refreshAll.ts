/**
 * Refresh the cached model list of every enabled connection whose provider supports discovery and is not globally disabled
 *
 * Use as the hourly background job of the models module (started by models/$start) or to refresh all caches at once. Reads models.disabledProviders once per run and skips connections of disabled providers without any provider request. Runs connections sequentially through models.listModels with refresh; a failed discovery keeps that connection's previous cache. Returns per-connection counts and safe errors, never secrets.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ refreshed: number; failed: { id: string; error: string }[] }> {
    const providers = ctx.state.models?.providers ?? {};
        const disabled = await ctx.fns.models.disabledProviders({});
        const connections = (await ctx.fns.models.connections.list({})).filter(c => c.enabled && !disabled.has(c.provider) && Object.hasOwn(providers, c.provider) && !!providers[c.provider]!.definition.listModels);
        let refreshed = 0;
        const failed: { id: string; error: string }[] = [];
        for (const c of connections) {
            try {
                const r = await ctx.fns.models.catalog.listModels({ id: c.id, refresh: true });
                if (r.error) failed.push({ id: c.id, error: r.error }); else refreshed++;
            } catch (error) {
                failed.push({ id: c.id, error: ctx.fns.models.connections.safeMessage({ message: error, fallback: "Model discovery failed" }) });
            }
        }
        return { refreshed, failed };
}
