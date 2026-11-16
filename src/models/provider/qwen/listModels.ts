/**
 * Discover the Qwen subscription models of one connection
 *
 * listModels adapter of the qwen provider; reached through models.listModels / models.refreshAll. Requires a login (LOGIN_REQUIRED without any request otherwise), then sends one authenticated GET https://api.qwen.ai/compatible-mode/v1/models through the connection's transport. Maps each well-formed unique `data[].id` to protocol `openai-chat` with `context_window_tokens` as contextWindow; image input is noted in the description only when `image` is among `input_modalities` (unknown modalities are ignored). A 401 invalidates the cached access token. An empty or malformed list throws "Invalid model catalogue" (never the body) so a failed refresh keeps the previous cache.
 * @param opts.conn Resolved qwen connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ModelInfo[]> {
    const k = ctx.fns.models.provider.qwen.constants({});
    const headers = { accept: "application/json", ...(await ctx.fns.models.provider.qwen.headers({ conn: opts.conn })) };
    const res = await opts.conn.fetch(k.apiBase + "/models", { method: "GET", headers });
    if (res.status === 401) {
        await res.body?.cancel().catch(() => undefined);
        await ctx.fns.models.provider.qwen.auth({ conn: opts.conn, op: "invalidate" });
        throw Object.assign(new Error("Qwen rejected the access token; retry to refresh it"), { code: "AUTH", status: 401 });
    }
    if (!res.ok) { await res.body?.cancel().catch(() => undefined); throw Object.assign(new Error("Model discovery request failed (HTTP " + res.status + ")"), { status: res.status }); }
    const payload = await res.json().catch(() => null) as { data?: unknown } | null;
    const rows = payload && typeof payload === "object" && Array.isArray(payload.data) ? payload.data : null;
    if (!rows) throw new Error("Invalid model catalogue");
    return ctx.fns.models.provider.qwen.mapModels({ rows });
}
