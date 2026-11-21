/**
 * Test a Gemini Code Assist connection by running setup
 *
 * test adapter of the gemini provider. Without a usable login returns configured/login-required without any request. Otherwise runs Code Assist setup through the transport (force, so the account is checked again): success is available with the tier, a missing or rejected login is unavailable/login-required, any other failure unavailable with a safe message — never exposing tokens or response bodies.
 * @param opts.conn Resolved gemini connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.TestResult> {
    const { conn } = opts;
    const state = await ctx.fns.models.provider.gemini.auth({ conn, op: "status" });
    if (!state.loggedIn) return { status: "configured", reason: "login-required", message: "Log in to use this connection", checkedAt: Date.now() };
    try {
        const { tier } = await ctx.fns.models.provider.gemini.setup({ conn, force: true });
        const who = [tier?.name, state.account?.email].filter(Boolean).join(", ");
        return { status: "available", reason: "setup-ok", message: "Logged in" + (who ? " (" + who + ")" : "") + "; Code Assist ready", checkedAt: Date.now() };
    } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === "LOGIN_REQUIRED" || code === "AUTH") return { status: "unavailable", reason: "login-required", message: "Login expired or rejected; log in again", checkedAt: Date.now() };
        return { status: "unavailable", reason: "setup-failed", message: ctx.fns.models.connections.safeMessage({ message: error, fallback: "Gemini Code Assist setup failed" }), checkedAt: Date.now() };
    }
}
