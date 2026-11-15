/**
 * Discover the Z.ai Coding Plan models of one connection with their reasoning controls
 *
 * listModels adapter of the zai-coding provider; reached through models.listModels / models.refreshAll. Sends one authenticated GET https://api.z.ai/api/coding/paas/v4/models through the connection's transport (never directly), keeps unique well-formed `data[].id` values in catalogue order, and attaches the documented reasoning levels to a GLM-5.3 model on an openai-chat connection only — the Chat Completions wire takes low/high/max effort, the AnthropicMessages route of the same plan advertises no levels. Throws a safe error carrying the HTTP status or "Invalid model catalogue" (never the response body) so a failed refresh keeps the previous cache.
 * @param opts.conn Resolved zai-coding connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved zai-coding connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ModelInfo[]> {
    const headers = { accept: "application/json", ...(await ctx.fns.models.provider.zaiCoding.headers({ conn: opts.conn })) };
        const res = await ctx.fns.models.protocol.common.checkedFetch({
            fetch: opts.conn.fetch, url: "https://api.z.ai/api/coding/paas/v4/models",
            init: { method: "GET", headers }, what: "Model discovery request",
        });
        const raw = await ctx.fns.models.protocol.common.openaiModels({ response: res });
        const anthropic = String(opts.conn.config.protocol) === "anthropic";
        const models: types.models.ModelInfo[] = [];
        for (const m of raw) {
            if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(m.id)) continue;
            models.push(anthropic || !ctx.fns.models.provider.zaiCoding.isGlm53({ model: m.id }) ? { id: m.id } : {
                id: m.id,
                // GLM-5.3 always reasons — off and the middle levels are unavailable — and names xhigh "max".
                reasoning: { supported: ["low", "high", "xhigh"], default: "xhigh", wire: { low: "low", high: "high", xhigh: "max" } },
            });
        }
        return models;
}
