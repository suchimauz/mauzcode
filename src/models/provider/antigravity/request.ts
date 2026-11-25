/**
 * Send an allow-listed Antigravity request through the connection transport
 *
 * Use for every Antigravity OAuth token, project, inventory and generation request. Only the token endpoint and
 * the `loadCodeAssist`, `fetchAvailableModels` and `streamGenerateContent?alt=sse` operations of the fixed Cloud Code
 * host are allowed, each with POST; anything else fails PROXY_CONFIG before the transport is called. Redirects are
 * refused. Never falls back to a direct request.
 * @param opts.conn Resolved antigravity connection supplying the only permitted transport.
 * @param opts.url Exact allow-listed HTTPS endpoint.
 * @param opts.init HTTP method, headers, body and cancellation signal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection supplying the only permitted transport. */
        conn: types.models.ResolvedConnection;
        /** Exact allow-listed HTTPS endpoint. */
        url: string;
        /** HTTP method, headers, body and cancellation signal. */
        init: RequestInit;
    },
): Promise<Response> {
    const k = ctx.fns.models.provider.antigravity.constants({});
    const allowed = new Set([k.tokenUrl, k.apiBase + ":loadCodeAssist", k.apiBase + ":fetchAvailableModels", k.apiBase + ":streamGenerateContent?alt=sse"]);
    if (!allowed.has(opts.url) || (opts.init.method ?? "GET").toUpperCase() !== "POST") {
        throw Object.assign(new Error("PROXY_CONFIG: Antigravity endpoint is not allowed"), { code: "PROXY_CONFIG", retryable: false, requestSent: false });
    }
    return opts.conn.fetch(opts.url, { ...opts.init, redirect: "error" });
}
