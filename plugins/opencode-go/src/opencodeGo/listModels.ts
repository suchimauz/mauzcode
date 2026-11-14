/**
 * Discover OpenCode Go tool-capable chat models with protocol, limits and reasoning metadata.
 *
 * listModels adapter of the opencode-go provider; reached through models.listModels / models.refreshAll. Sends an authenticated GET https://opencode.ai/inference/go/v1/models through the connection's transport (never directly), maps each entry with opencodeGo.mapModel, de-duplicates ids and keeps catalogue order. Throws a safe error with the HTTP status (no body) on failure or an invalid payload.
 * @param opts.conn Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ModelInfo[]> {
    const headers = { accept: "application/json", ...(await ctx.fns.opencodeGo.headers({ conn: opts.conn })) };
        const res = await opts.conn.fetch("https://opencode.ai/inference/go/v1/models", { headers, redirect: "error", signal: AbortSignal.timeout(30000) });
        if (!res.ok) { await res.body?.cancel().catch(() => undefined); throw Object.assign(new Error("OpenCode Go model discovery failed (HTTP " + res.status + ")"), { status: res.status }); }
        const body = await res.json().catch(() => null) as { data?: unknown } | null;
        if (!body || !Array.isArray(body.data)) throw new Error("OpenCode Go returned an invalid model list");
        const seen = new Set<string>();
        const models: types.models.ModelInfo[] = [];
        for (const raw of body.data.slice(0, 2000)) {
            const info = ctx.fns.opencodeGo.mapModel({ raw });
            if (info && !seen.has(info.id)) { seen.add(info.id); models.push(info); }
        }
        return models;
}
