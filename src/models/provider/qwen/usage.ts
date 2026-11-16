/**
 * Report a Qwen subscription connection's plan and last observed weekly-credit exhaustion as a usage report
 *
 * usage adapter of the qwen provider. Qwen exposes no usage endpoint, so this sends no network request: without a usable login it returns `configured`/login-required; otherwise `available` with the plan (`member_type`) from the stored account summary and, when models.provider.qwen.failure recorded a 402 insufficient_quota that has not expired, one account-wide weekly window at 100% with the reported reset time (Qwen sends none: shown for one hour). An elapsed record clears the recorded exhaustion. Never returns tokens.
 * @param opts.conn Resolved qwen connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.UsageReport> {
    const { conn } = opts;
    const now = Date.now();
    const state = await ctx.fns.models.provider.qwen.auth({ conn, op: "status" });
    if (!state.loggedIn) return { status: "configured", reason: "login-required", checkedAt: now };
    const quota = ((ctx.state.models ??= {}).qwenQuota ??= {});
    const hit = quota[conn.id];
    if (hit && hit.until <= now) delete quota[conn.id];
    const live = quota[conn.id];
    const plan = state.account?.plan;
    return {
        status: "available", reason: "usage-ok", checkedAt: now,
        ...(plan ? { plan } : {}),
        ...(live ? { windows: [{ id: "qwen:weekly", label: "Weekly credits", period: "weekly" as const, scope: "account" as const, usedPercent: 100, ...(live.resetAt ? { resetAt: live.resetAt } : {}), observedAt: live.observedAt }] } : {}),
    };
}
