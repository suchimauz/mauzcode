/**
 * Read the Z.ai Coding Plan quota snapshot as a connection test result
 *
 * test adapter of the zai-coding provider; reached through models.test. Sends one GET to the quota endpoint through models.provider.zaiCoding.testProbe, which also proves the stored key works. 401/403 become unavailable / unauthorized, any other failure unavailable / request-failed, and a valid snapshot available / usage-ok; no message ever carries the key or upstream content.
 * @param opts.conn Resolved zai-coding connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved zai-coding connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.TestResult> {
    const _ctx = ctx;
    const now = Date.now();
    try {
        const probe = await ctx.fns.models.provider.zaiCoding.testProbe({ conn: opts.conn });
        if ("ok" in probe) return { status: "available", reason: "usage-ok", message: "Quota snapshot retrieved", checkedAt: now };
        return { status: "unavailable", reason: "unauthorized", message: "The Coding Plan key was rejected", checkedAt: now };
    } catch (error) {
        const status = (error as { status?: unknown } | null)?.status;
        if (status === 401 || status === 403) return { status: "unavailable", reason: "unauthorized", message: "The Coding Plan key was rejected", checkedAt: now };
        return { status: "unavailable", reason: "request-failed", message: "The quota endpoint could not be read", checkedAt: now };
    }
}
