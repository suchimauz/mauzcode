/**
 * Discover custom endpoint models through its configured shared protocol and append manual model ids.
 *
 * Use from the custom provider's listModels adapter. Selects the protocol with models.protocol.get, passes only conn.fetch to it, and appends config.models ids not already discovered; discovery errors propagate so core listModels can apply its manual fallback.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying scoped credentials and transport. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ModelInfo[]> {
    const { conn } = opts;
    const protocol = ctx.fns.models.protocol.get({ id: String(conn.config.protocol) });
    const endpoint = await ctx.fns.models.provider.custom.customEndpoint({ conn, protocol });
    const discovered = await protocol.listModels(ctx, { fetch: conn.fetch, endpoint });
    const ids = new Set(discovered.map(model => model.id));
    for (const id of Array.isArray(conn.config.models) ? conn.config.models : []) {
        if (id && !ids.has(id)) { ids.add(id); discovered.push({ id }); }
    }
    return discovered;
}
