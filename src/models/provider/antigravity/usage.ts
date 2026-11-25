/**
 * Report the signed-in Antigravity account's measured quota per native model
 *
 * usage adapter of the antigravity provider. Without a usable sign-in returns `configured`/login-required (or
 * `unavailable` after a revoked grant) without any request. Otherwise resolves the account project and reads the
 * same authenticated `fetchAvailableModels` inventory as discovery over the connection transport — never a
 * generation — and maps it with models.provider.antigravity.mapUsage. Failures propagate to models.usage, which
 * reports `unavailable` without secrets. Never stores the raw inventory and never changes the model catalogue.
 * @param opts.conn Resolved antigravity connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.UsageReport> {
    const { conn } = opts;
    const checkedAt = Date.now();
    const s = await ctx.fns.models.provider.antigravity.auth({ conn, op: "status" });
    if (!s.loggedIn) return { status: s.expiresAt === null ? "configured" : "unavailable", reason: "login-required", checkedAt };
    const project = await ctx.fns.models.provider.antigravity.project({ conn });
    const response = await ctx.fns.models.provider.antigravity.api({ conn, method: "fetchAvailableModels", body: { project } });
    return { status: "available", reason: "usage-ok", checkedAt, windows: ctx.fns.models.provider.antigravity.mapUsage({ response, observedAt: checkedAt }) };
}
