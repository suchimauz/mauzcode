/**
 * Report OpenCode Go subscription usage windows for one connection.
 *
 * usage adapter of the opencode-go provider; reached through models.usage. Returns the 5h, weekly and monthly used percentages with server reset times (rate-limited counts as 100%). A failed or unrecognized response reports unavailable with a reason, never zero usage.
 * @param opts.conn Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.UsageReport> {
    const r = await ctx.fns.opencodeGo.readUsage({ conn: opts.conn });
        const checkedAt = Date.now();
        if (!r.ok) return { status: "unavailable", reason: r.status === 401 || r.status === 403 ? "unauthorized" : r.status ? "http-" + r.status : "usage-unrecognized", checkedAt };
        return { status: "available", plan: "Go", checkedAt, windows: r.windows.map(w => ({ label: w.label, usedPercent: w.usedPercent, resetAt: w.resetAt })) };
}
