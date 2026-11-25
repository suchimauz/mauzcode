/**
 * Classify Claude failures without exposing provider response bodies or secrets.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Original outgoing request used only to suppress echoed input. */
        request?: unknown;
        /** Request credential and routing values to suppress. */
        secrets?: string[];
        /** conn input used by the claude failure protocol helper. */
        conn: types.models.ResolvedConnection;
        /** body input used by the claude failure protocol helper. */
        body: string;
        /** h input used by the claude failure protocol helper. */
        h: Headers;
        /** status input used by the claude failure protocol helper. */
        status?: number;
    },
): Promise<never> {
    const { conn, body, h, status } = opts;
    
        if (status === 401 || status === 403) await ctx.fns.models.provider.claude.claudeAuth({ conn, op: "markLogin" });
        const classified = ctx.fns.models.provider.claude.classifyError({ status, body, headers: h });
        // Provider bodies can echo credentials. Preserve machine classification and timing,
        // never export raw payloads or provider-controlled error text.
        // Status-less SSE errors arrive after the request was accepted.
        const accepted = status === undefined || status < 400;
        const code = classified.kind === 'usage_limit' ? 'QUOTA_EXHAUSTED' : classified.kind === 'rate_limit' ? 'RATE_LIMITED' : classified.kind === 'auth' ? 'LOGIN_REQUIRED' : classified.kind === 'overflow' ? 'OVERFLOW' : 'PROVIDER_ERROR';
        const classification: types.models.FailureInfo['classification'] = classified.kind === 'usage_limit' ? 'quota' : classified.kind === 'rate_limit' ? 'throttled' : classified.kind === 'auth' ? 'auth' : classified.kind === 'overflow' ? 'invalid_input' : 'provider';
        const info: types.models.FailureInfo = {
            code, classification, retryable: classified.retryable,
            acceptance: accepted ? 'accepted' : 'rejected', replaySafe: !accepted,
            ...(status !== undefined ? { upstreamStatus: status } : {}),
            ...(classified.retryAfterMs !== undefined ? { retryAfterMs: classified.retryAfterMs } : {}),
            ...(classified.resetsAt != null ? { resetAt: classified.resetsAt } : {}),
        };
        if (opts.request !== undefined) {
            const diagnostic = ctx.fns.models.inference.providerDiagnostic({ provider: 'claude', stage: status === undefined ? 'stream' : 'http', status, body, request: opts.request, secrets: opts.secrets });
            throw ctx.fns.models.inference.failure({ info: { ...info, diagnostic }, message: diagnostic.summary });
        }
        throw ctx.fns.models.inference.failure({ info, message: `Claude request failed (${code})` });
}
