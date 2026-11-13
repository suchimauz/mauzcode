/**
 * Check subscription login and provider reachability through the connection transport.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
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
    
            const state = await ctx.fns.models.provider.claude.claudeAuth({ conn, op: "status" });
            if (!state.loggedIn || state.needsLogin) return { status: state.expiresAt === null ? "configured" : "unavailable", reason: "login-required", message: "Log in to Claude", checkedAt: Date.now() };
            try {
                const res = await ctx.fns.models.provider.claude.claudeWireRequest({ conn: conn, path: "/api/oauth/usage", init: { headers: await ctx.fns.models.provider.claude.claudeWireHeaders({ conn: conn, compact: false, usage: true }) } });
                await res.body?.cancel();
                return { status: "available", reason: "usage-ok", message: "Logged in to Claude", checkedAt: Date.now() };
            } catch (error) {
                const code = (error as { code?: string }).code;
                return { status: "unavailable", reason: code === "LOGIN_REQUIRED" || code === "AUTH" ? "login-required" : "request-failed", message: "Claude connection check failed", checkedAt: Date.now() };
            }
}
