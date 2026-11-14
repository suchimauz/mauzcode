/**
 * Classify Claude failures without exposing provider response bodies or secrets.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
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
        const { raw: _raw, message: _message, ...safe } = classified;
        const info = { ...safe, message: `Claude request failed (${classified.code})` };
        throw Object.assign(new Error(info.message), { failure: info, code: info.code, retryable: info.retryable, noFallback: true });
}
