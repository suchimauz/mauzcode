/**
 * Report the signed-in Antigravity account's measured quota per family pool and period
 *
 * usage adapter of the antigravity provider. Without a usable sign-in returns `configured`/login-required (or
 * `unavailable` after a revoked grant) without any request. Otherwise resolves the account project and makes one
 * authenticated, read-only `retrieveUserQuotaSummary` request over the connection transport with the Hub client
 * identity and the provider's token management — never a generation, never another account, project or host — and
 * maps its `groups[].buckets[]` with models.provider.antigravity.mapUsage. A malformed envelope and every request
 * failure propagate to models.usage (failed read). Never stores the raw summary and never changes the catalogue.
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
    const response = await ctx.fns.models.provider.antigravity.api({ conn, method: "retrieveUserQuotaSummary", body: { project } });
    return { status: "available", reason: "usage-ok", checkedAt, windows: ctx.fns.models.provider.antigravity.mapUsage({ response, observedAt: checkedAt }) };
}
