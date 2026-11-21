/**
 * Send one authenticated Code Assist API request through the connection transport
 *
 * Request helper of the gemini provider. Builds `https://cloudcode-pa.googleapis.com/v1internal:<method>` (or `v1internal/<operation>` for an LRO `path` GET), adds a fresh bearer token from models.provider.gemini.auth, JSON content type and the User-Agent `GeminiCLI/<pinned>/<model> (<platform>; <arch>; mauzcode)`, and sends through conn.fetch only. A 401 invalidates the access token without replaying, so the next request refreshes first (and a rejected refresh then fails LOGIN_REQUIRED); the 401 response itself is returned to the caller. Without `raw`, a non-success status throws a safe error with `status` and no body text. Never retries automatically.
 * @param opts.conn Resolved gemini connection.
 * @param opts.method Code Assist method, e.g. loadCodeAssist or streamGenerateContent.
 * @param opts.path Operation path for a GET, e.g. operations/123; replaces method.
 * @param opts.body JSON body for a POST.
 * @param opts.query Extra query string without "?", e.g. alt=sse.
 * @param opts.model Model id for the User-Agent. @default "unknown"
 * @param opts.signal Optional cancellation signal.
 * @param opts.raw Return failed responses instead of throwing. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection. */
        conn: types.models.ResolvedConnection;
        /** Code Assist method, e.g. loadCodeAssist or streamGenerateContent. */
        method?: string;
        /** Operation path for a GET, e.g. operations/123; replaces method. */
        path?: string;
        /** JSON body for a POST. */
        body?: Record<string, unknown>;
        /** Extra query string without "?", e.g. alt=sse. */
        query?: string;
        /** Model id for the User-Agent. @default "unknown" */
        model?: string;
        /** Optional cancellation signal. */
        signal?: AbortSignal;
        /** Return failed responses instead of throwing. @default false */
        raw?: boolean;
    },
): Promise<Response> {
    const { conn } = opts;
    const k = ctx.fns.models.provider.gemini.constants({});
    const target = opts.path !== undefined
        ? k.apiBase + "/" + k.apiVersion + "/" + opts.path.replace(/^\/+/, "")
        : k.apiBase + "/" + k.apiVersion + ":" + (opts.method ?? "");
    const url = target + (opts.query ? "?" + opts.query : "");
    const headers: Record<string, string> = { ...(await ctx.fns.models.provider.gemini.headers({ conn, model: opts.model })), "content-type": "application/json" };
    const res = await conn.fetch(url, {
        method: opts.path !== undefined ? "GET" : "POST",
        headers,
        ...(opts.path !== undefined ? {} : { body: JSON.stringify(opts.body ?? {}) }),
        ...(opts.signal ? { signal: opts.signal } : {}),
    });
    if (res.status === 401) await ctx.fns.models.provider.gemini.auth({ conn, op: "invalidate" }).catch(() => undefined);
    if (res.ok || opts.raw) return res;
    await res.body?.cancel().catch(() => undefined);
    if (res.status === 401) throw Object.assign(new Error("Google rejected the access token; the next request refreshes it"), { code: "AUTH", status: 401, retryable: false });
    throw Object.assign(new Error("Code Assist request failed (HTTP " + res.status + ")"), { code: res.status === 403 ? "AUTH" : "PROVIDER_ERROR", status: res.status, upstreamStatus: res.status });
}
