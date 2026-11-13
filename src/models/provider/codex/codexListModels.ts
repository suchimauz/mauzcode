/**
 * List provider model identifiers and preserve discovery fallback semantics.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
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
    const BASE = "https://chatgpt.com/backend-api";
    
            const a = await ctx.fns.models.provider.codex.codexWireAuth({ conn: conn });
            const res = await ctx.fns.models.provider.codex.codexWireChecked({ conn: conn, res: await conn.fetch(`${BASE}/codex/models?client_version=${encodeURIComponent(ctx.fns.models.provider.codex.codexVersion({ config: conn.config }))}`, { headers: { authorization: `Bearer ${a.token}`, originator: "codex_cli_rs" } }) });
            const data = await res.json() as { models?: { slug?: unknown; display_name?: unknown; description?: unknown; visibility?: unknown; supported_in_api?: unknown; context_window?: unknown; supported_reasoning_levels?: unknown; default_reasoning_level?: unknown }[] };
            return (data.models ?? [])
                .filter(m => typeof m?.slug === "string" && m.visibility !== "hidden" && m.visibility !== "hide" && m.supported_in_api !== false)
                .map(m => {
                    const reasoning = ctx.fns.models.provider.codex.codexWireDiscoveredReasoning({ m: m });
                    return {
                    id: m.slug as string,
                    ...(typeof m.display_name === "string" ? { label: m.display_name } : {}),
                    ...(typeof m.description === "string" ? { description: m.description } : {}),
                    ...(typeof m.context_window === "number" ? { contextWindow: m.context_window } : {}),
                    ...(reasoning ? { reasoning } : {}),
                    };
                });
}
