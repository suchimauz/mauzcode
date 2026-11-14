/**
 * Check Codex HTTP response status and classify safe provider failures.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** conn input used by the codex checked protocol helper. */
        conn: types.models.ResolvedConnection;
        /** res input used by the codex checked protocol helper. */
        res: Response;
    },
): Promise<Response> {
    const { conn, res } = opts;
    
        if (res.ok) return res;
        const text = await res.text().catch(() => "");
        let error: Record<string, unknown> | null = null;
        try { const j = JSON.parse(text); error = (j?.error && typeof j.error === "object" ? j.error : j) as Record<string, unknown>; } catch { /* non-JSON body: classify by status */ }
        if (res.status === 401) await ctx.fns.models.provider.codex.codexAuth({ conn, op: "markLogin" });
        const f = ctx.fns.models.provider.codex.codexFailure({ phase: "http", status: res.status, error, retryAfter: res.headers.get("retry-after") });
        throw ctx.fns.models.inference.failure(f);
}
