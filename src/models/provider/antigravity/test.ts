/**
 * Test an Antigravity connection without generating
 *
 * test adapter of the antigravity provider. Without a usable sign-in returns `configured`/login-required (or
 * `unavailable` after a revoked grant) without any request. Otherwise resolves the project and inventory: eligible
 * models are `available`/models-ok; an empty eligible catalogue is `unavailable`/no-models; a missing project is
 * project-unavailable, a denied account access-denied, a rejected sign-in login-required, anything else
 * request-failed. Never sends a generation, tokens or response bodies.
 * @param opts.conn Resolved antigravity connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.TestResult> {
    const { conn } = opts;
    const checkedAt = Date.now();
    const s = await ctx.fns.models.provider.antigravity.auth({ conn, op: "status" });
    if (!s.loggedIn) return { status: s.expiresAt === null ? "configured" : "unavailable", reason: "login-required", message: "Log in to Antigravity to use this connection", checkedAt };
    try {
        const models = await ctx.fns.models.provider.antigravity.listModels({ conn });
        return models.length
            ? { status: "available", reason: "models-ok", message: `Signed in; ${models.length} Gemini model${models.length === 1 ? "" : "s"} available`, checkedAt }
            : { status: "unavailable", reason: "no-models", message: "Signed in, but the account offers no eligible Gemini models", checkedAt };
    } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === "LOGIN_REQUIRED" || code === "AUTH") return { status: "unavailable", reason: "login-required", message: "Antigravity sign-in expired or was rejected; log in again", checkedAt };
        if (code === "PROJECT_UNAVAILABLE") return { status: "unavailable", reason: "project-unavailable", message: "This Antigravity account has no accessible project", checkedAt };
        if (code === "ACCESS_DENIED") return { status: "unavailable", reason: "access-denied", message: "Google denied this Antigravity account access", checkedAt };
        return { status: "unavailable", reason: "request-failed", message: "Antigravity connection check failed", checkedAt };
    }
}
