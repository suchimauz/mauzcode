/**
 * Send a Claude allow-listed request and record response quota headers.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** conn input used by the claude request protocol helper. */
        conn: types.models.ResolvedConnection;
        /** path input used by the claude request protocol helper. */
        path: string;
        /** init input used by the claude request protocol helper. */
        init: RequestInit;
    },
): Promise<Response> {
    const BASE = "https://api.anthropic.com";
    const { conn, path, init } = opts;
    
        const res = await ctx.fns.models.provider.claude.claudeRequest({ conn, url: (ctx.env.CLAUDE_CODE_BASE_API_URL || BASE).replace(/\/+$/, "") + path, init });
        if (!res.ok && path === '/v1/messages') {
            let text = "";
            await ctx.fns.models.inference.readErrorBody({ response: res, captureText: value => { text = value; } });
            const headers = new Headers(init.headers);
            const secrets = [...headers.values(), (headers.get('authorization') ?? '').replace(/^Bearer /i, '')];
            const request: unknown = typeof init.body === 'string' ? init.body : undefined;
            return ctx.fns.models.provider.claude.claudeWireFailure({ conn, body: text, status: res.status, h: res.headers, request, secrets });
        }
        if (!res.ok) return ctx.fns.models.provider.claude.claudeWireFailure({ conn: conn, body: await res.text(), h: res.headers, status: res.status });
        return res;
}
