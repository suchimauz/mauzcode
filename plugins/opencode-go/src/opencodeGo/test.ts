/**
 * Check that an OpenCode Go key is accepted, using the free authenticated usage read.
 *
 * test adapter of the opencode-go provider; reached through models.test. Performs the authenticated GET /inference/go/v1/usage (no inference, no charge): success → available/usage-ok, HTTP 401 or 403 → unavailable/unauthorized, a missing key → configured/key-required without network, anything else → unavailable/request-failed. Messages never contain the key or response bodies.
 * @param opts.conn Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.TestResult> {
    if (!(await opts.conn.secret("apiKey"))) return { status: "configured", reason: "key-required", message: "Add an OpenCode Go API key", checkedAt: Date.now() };
        const r = await ctx.fns.opencodeGo.readUsage({ conn: opts.conn });
        if (r.ok) return { status: "available", reason: "usage-ok", message: "OpenCode Go key accepted", checkedAt: Date.now() };
        if (r.status === 401 || r.status === 403) return { status: "unavailable", reason: "unauthorized", message: "OpenCode Go rejected the API key", checkedAt: Date.now() };
        return { status: "unavailable", reason: "request-failed", message: "OpenCode Go usage check failed" + (r.status ? " (HTTP " + r.status + ")" : ""), checkedAt: Date.now() };
}
