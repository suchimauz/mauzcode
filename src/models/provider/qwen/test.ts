/**
 * Test a Qwen subscription connection by listing its models
 *
 * test adapter of the qwen provider. Without a usable login returns `configured`/login-required without any request. Otherwise lists models through the transport: success is available, a missing or rejected login unauthorized (login-required), anything else unavailable — never exposing tokens or response bodies. The safe account summary appears in the message when known.
 * @param opts.conn Resolved qwen connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.TestResult> {
    const { conn } = opts;
    const state = await ctx.fns.models.provider.qwen.auth({ conn, op: "status" });
    if (!state.loggedIn) return { status: "configured", reason: "login-required", message: "Log in to use this connection", checkedAt: Date.now() };
    const who = state.account?.plan ? " (" + state.account.plan + ")" : "";
    try {
        await ctx.fns.models.provider.qwen.listModels({ conn });
        return { status: "available", reason: "models-ok", message: "Logged in" + who + "; model list available", checkedAt: Date.now() };
    } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        return code === "LOGIN_REQUIRED" || code === "AUTH"
            ? { status: "unavailable", reason: "login-required", message: "Login expired or rejected; log in again", checkedAt: Date.now() }
            : { status: "unavailable", reason: "request-failed", message: "Qwen gateway request failed", checkedAt: Date.now() };
    }
}
