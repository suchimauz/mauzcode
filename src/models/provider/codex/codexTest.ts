/**
 * Check subscription login and provider reachability through the connection transport.
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
): Promise<types.models.TestResult> {
    const { conn } = opts;
    const BASE = "https://chatgpt.com/backend-api";
    
            const state = await ctx.fns.models.provider.codex.codexAuth({ conn, op: "status" });
            if (!state.loggedIn) return { status: "configured", reason: "login-required", message: "Log in to use this connection", checkedAt: Date.now() };
            try {
                const a = await ctx.fns.models.provider.codex.codexWireAuth({ conn: conn });
                const res = await conn.fetch(`${BASE}/codex/models?client_version=${encodeURIComponent(await ctx.fns.models.provider.codex.codexVersion({ config: conn.config }))}`, { headers: { authorization: `Bearer ${a.token}`, originator: "codex_cli_rs" } });
                await (await ctx.fns.models.provider.codex.codexWireChecked({ conn: conn, res: res })).body?.cancel().catch(() => undefined);
                return { status: "available", reason: "models-ok", message: "Logged in; model list available", checkedAt: Date.now() };
            } catch (error) {
                const code = (error as { code?: unknown }).code;
                return code === "LOGIN_REQUIRED"
                    ? { status: "unavailable", reason: "login-required", message: "Login expired; log in again", checkedAt: Date.now() }
                    : { status: "unavailable", reason: "request-failed", message: "Codex backend request failed", checkedAt: Date.now() };
            }
}
