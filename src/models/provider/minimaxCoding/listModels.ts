/**
 * Discover the MiniMax M Plan models of one connection with their reasoning controls
 *
 * listModels adapter of the minimax-coding provider; reached through models.listModels / models.refreshAll. Sends one authenticated GET https://api.minimax.io/anthropic/v1/models through the connection's transport (never directly) and keeps unique well-formed `data[].id` values in catalogue order with the gateway's display_name as label. Documented reasoning metadata is attached per family: MiniMax-M3.1-Flash offers low..xhigh under native names with adaptive thinking (auto sends nothing, so MiniMax applies its own default), MiniMax-M3 and M3.x point releases offer only off and high (thinking on) with off the default and no effort control; every other listed id (M2.x, unknown families) is returned without reasoning controls. Advertised models are not a guarantee of plan entitlement. Throws a safe error carrying the HTTP status or exactly "Invalid model catalogue" (never the response body) so a failed refresh keeps the previous model cache.
 * @param opts.conn Resolved minimax-coding connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved minimax-coding connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ModelInfo[]> {
    const headers = { accept: "application/json", ...(await ctx.fns.models.provider.minimaxCoding.headers({ conn: opts.conn })) };
    const res = await ctx.fns.models.protocol.common.checkedFetch({
        fetch: opts.conn.fetch, url: "https://api.minimax.io/anthropic/v1/models",
        init: { method: "GET", headers }, what: "Model discovery request",
    });
    const text = await res.text();
    let rows: unknown;
    try { rows = (JSON.parse(text) as { data?: unknown } | null)?.data; } catch { throw new Error("Invalid model catalogue"); }
    if (!Array.isArray(rows)) throw new Error("Invalid model catalogue");
    const models: types.models.ModelInfo[] = [];
    const seen = new Set<string>();
    for (const row of rows.slice(0, 500)) {
        if (!row || typeof row !== "object") continue;
        const id = (row as { id?: unknown }).id;
        if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) || seen.has(id)) continue;
        seen.add(id);
        const displayName = (row as { display_name?: unknown }).display_name;
        const label = typeof displayName === "string" ? displayName.trim().slice(0, 120) : "";
        const profile = ctx.fns.models.provider.minimaxCoding.reasoningProfile({ model: id });
        models.push({
            id,
            ...(label ? { label } : {}),
            ...(profile ? { reasoning: { supported: profile.supported, ...(profile.default !== undefined ? { default: profile.default } : {}), adaptive: true, ...(profile.effort === false ? { effort: false } : {}) } } : {}),
        });
    }
    return models;
}
