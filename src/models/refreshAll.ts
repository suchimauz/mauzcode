/**
 * Refresh the cached model list of every enabled connection whose provider supports discovery
 *
 * Use as the hourly background job of the models module (started by models/$start) or to refresh all caches at once. Runs connections sequentially through models.listModels with refresh; a failed discovery keeps that connection's previous cache. Returns per-connection counts and safe errors, never secrets.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    _opts: {},
): Promise<{ refreshed: number; failed: { id: string; error: string }[] }> {
    return ctx.fns.models.catalog.refreshAll(_opts);
}
