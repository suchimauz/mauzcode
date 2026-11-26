/**
 * Convert legacy per-level disables of variant groups into group-only availability flags
 *
 * Connection-local, idempotent migration for providers declaring `capabilities.groupAvailability` (Antigravity). Runs after each successful catalogue refresh publication (models.listModels) and once at startup for every connection (models/$start); cache-only reads never call it. Under the connection row lock it reads the validated cached catalogue (no provider request, no discovery); without a provider-published catalogue (cold cache, manual list) nothing is written. For each group proven by validated `reasoning.variants`: an explicitly disabled group or one whose every member is stored disabled keeps (or gains) its group id; otherwise the group stays on. The group's proven member ids are removed from the stored set. Unproven ids, standalone models and other connections are untouched; nothing is grouped by name. Writes only when the stored set changes (bumping updatedAt and emitting llm-models refresh after commit), so observed availability is unchanged by the conversion. With `id` omitted converts every connection of such providers; failures of one connection do not stop the others.
 * @param opts.id Connection UUID; omitted converts every eligible connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID; omitted converts every connection whose provider declares group-level availability. */
        id?: string;
    } = {},
): Promise<{ converted: string[]; failed: string[] }> {
    const providers = ctx.state.models?.providers ?? {};
    const grouped = (provider: string) => Object.hasOwn(providers, provider) && providers[provider]!.definition.capabilities?.groupAvailability === true;
    const ids = opts.id !== undefined ? [String(opts.id)]
        : (await ctx.fns.models.connections.list({})).filter(c => grouped(c.provider)).map(c => c.id);
    const converted: string[] = [], failed: string[] = [];
    for (const id of ids) {
        try {
            const changed = await ctx.fns.procs.db.transaction({ fn: async () => {
                // The row lock serializes against availability edits, refresh publications and other conversions.
                const [row] = await ctx.fns.procs.db.select({ sql: "SELECT provider, disabled_models, updated_at FROM llm_connections WHERE id=? FOR UPDATE", params: [id] }) as { provider: string; disabled_models: string[]; updated_at: string | number }[];
                if (!row || !grouped(row.provider)) return false;
                const catalogue = await ctx.fns.models.catalog.listModels({ id, cacheOnly: true });
                if (catalogue.source !== "provider") return false;
                const stored = Array.isArray(row.disabled_models) ? row.disabled_models : [];
                const { groups } = ctx.fns.models.catalog.effectiveDisabled({ models: catalogue.models, disabled: stored });
                const next = new Set(stored);
                for (const [group, g] of Object.entries(groups)) {
                    for (const member of g.members) next.delete(member);
                    if (g.off) next.add(group);
                }
                const before = [...new Set(stored)].sort(), after = [...next].sort();
                if (before.join("\n") === after.join("\n")) return false;
                await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET disabled_models=?::text[], updated_at=GREATEST(updated_at+1, ?) WHERE id=?", params: [after, Date.now(), id] });
                return true;
            } });
            if (changed) converted.push(id);
        } catch (error) {
            failed.push(id);
            ctx.fns.procs.log.warn({ event: "models.convertLegacyDisables", msg: ctx.fns.models.connections.safeMessage({ message: error, fallback: "Legacy disable conversion failed" }) });
        }
    }
    if (converted.length) {
        try { await ctx.fns.procs.events.refresh({ topic: "llm-models", reason: "models-legacy-disables-converted" }); } catch (error) { ctx.fns.procs.log.debug({ event: "models.refresh", msg: String(error) }); }
    }
    return { converted, failed };
}
