/**
 * Send one authenticated Antigravity control request and return its JSON body
 *
 * Discovery helper of the antigravity provider for `loadCodeAssist` and `fetchAvailableModels`. Adds a fresh
 * bearer token and the Hub User-Agent and sends through the connection transport only. A 401 marks the token stale
 * and repeats the request once with the refreshed token of the same account; a second 401 fails AUTH. A 403 fails
 * ACCESS_DENIED, other statuses PROVIDER_ERROR and an unreadable body INVALID_RESPONSE — with fixed messages outside inference.
 * During inference a terminal upstream rejection carries only normalized diagnostic evidence. Never tries another account, project or host.
 * @param opts.conn Resolved antigravity connection.
 * @param opts.method Control operation name.
 * @param opts.body JSON request body.
 * @param opts.inference Attach safe upstream evidence for calls needed by generation.
 * @param opts.signal Optional cancellation signal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection. */
        conn: types.models.ResolvedConnection;
        /** Control operation name. */
        method: "loadCodeAssist" | "fetchAvailableModels";
        /** JSON request body. */
        body: Record<string, unknown>;
        /** Optional cancellation signal. */
        signal?: AbortSignal;
        /** Attach diagnostics when this operation blocks generation. */
        inference?: boolean;
    },
): Promise<Record<string, unknown>> {
    const { conn } = opts;
    const k = ctx.fns.models.provider.antigravity.constants({});
    const fail = (code: string, classification: types.models.FailureInfo["classification"], message: string, upstreamStatus?: number, diagnostic?: types.models.ProviderDiagnostic) =>
        ctx.fns.models.inference.failure({ message: diagnostic?.summary ?? message, status: code === "ACCESS_DENIED" ? 403 : 502, info: { code, classification, ...(diagnostic && { diagnostic }), acceptance: "rejected", retryable: false, replaySafe: true, ...(upstreamStatus ? { upstreamStatus } : {}) } });
    for (let attempt = 1; ; attempt++) {
        const accessToken = (await ctx.fns.models.provider.antigravity.auth({ conn, op: "token" })).accessToken!;
        const res = await ctx.fns.models.provider.antigravity.request({ conn, url: k.apiBase + ":" + opts.method, init: {
            method: "POST", headers: { authorization: "Bearer " + accessToken, "content-type": "application/json", accept: "application/json", "user-agent": k.userAgent },
            body: JSON.stringify(opts.body), ...(opts.signal ? { signal: opts.signal } : {}),
        } });
        const diagnostic = opts.inference && !res.ok ? ctx.fns.models.inference.providerDiagnostic({ provider: conn.provider, stage: 'http', status: res.status, body: await ctx.fns.models.inference.readErrorBody({ response: res }), request: opts.body, secrets: [accessToken] }) : undefined;
        if (!res.ok && !opts.inference) await res.body?.cancel().catch(() => undefined);
        opts.signal?.throwIfAborted();
        if (res.status === 401) {
            const r = await ctx.fns.models.provider.antigravity.auth({ conn, op: "rejected", accessToken });
            if (r.retry && attempt === 1) continue;
            throw fail("AUTH", "auth", "Google rejected the Antigravity sign-in; log in again", 401, diagnostic);
        }
        if (res.status === 403) throw fail("ACCESS_DENIED", "auth", "Google denied this Antigravity account access", 403, diagnostic);
        if (!res.ok) throw fail("PROVIDER_ERROR", "provider", `Antigravity ${opts.method} failed (HTTP ${res.status})`, res.status, diagnostic);
        await ctx.fns.models.provider.antigravity.auth({ conn, op: "accepted", accessToken });
        const body = await res.json().catch(() => null) as unknown;
        if (!body || typeof body !== "object" || Array.isArray(body)) throw fail("INVALID_RESPONSE", "provider", `Antigravity ${opts.method} returned invalid data`);
        return body as Record<string, unknown>;
    }
}
