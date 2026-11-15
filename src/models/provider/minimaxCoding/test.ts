/**
 * Read the MiniMax M Plan quota endpoint as a connection test result
 *
 * test adapter of the minimax-coding provider; reached through models.test. Makes exactly one authenticated GET to the token-plan remains endpoint through the connection's transport — this also proves the stored key works — and classifies the outcome without exposing the key or the response body: available when the payload is a recognized quota snapshot, unavailable / unauthorized on HTTP 401/403 or on MiniMax codes 1004 (invalid key) and 2057 (not an M Plan key) even inside an HTTP 200 body, and unavailable / request-failed for every other failure.
 * @param opts.conn Resolved minimax-coding connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved minimax-coding connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.TestResult> {
    const _ctx = ctx;
    const now = Date.now();
    const unauthorized = (message: string): types.models.TestResult => ({ status: "unavailable", reason: "unauthorized", message, checkedAt: now });
    const failed = (): types.models.TestResult => ({ status: "unavailable", reason: "request-failed", message: "The quota endpoint could not be read", checkedAt: now });
    try {
        const headers = { accept: "application/json", ...(await ctx.fns.models.provider.minimaxCoding.headers({ conn: opts.conn, auth: "bearer" })) };
        const res = await opts.conn.fetch("https://www.minimax.io/v1/token_plan/remains", { method: "GET", headers, redirect: "error" });
        if (!res.ok) {
            await res.body?.cancel().catch(() => undefined);
            if (res.status === 401 || res.status === 403) return unauthorized("The M Plan key was rejected");
            return failed();
        }
        const body = await res.json().catch(() => null) as { base_resp?: { status_code?: unknown } } | null;
        const code = Number(body?.base_resp?.status_code);
        if (Number.isFinite(code) && code !== 0) {
            if (code === 2057) return unauthorized("An M Plan key is required");
            if (code === 1004) return unauthorized("The M Plan key was rejected");
            return failed();
        }
        return code === 0 && body ? { status: "available", reason: "usage-ok", message: "Quota snapshot retrieved", checkedAt: now } : failed();
    } catch (error) {
        const status = (error as { status?: unknown } | null)?.status;
        if (status === 401 || status === 403) return unauthorized("The M Plan key was rejected");
        return failed();
    }
}
