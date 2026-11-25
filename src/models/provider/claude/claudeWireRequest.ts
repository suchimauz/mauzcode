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
        /** Initial automatic streaming limit; omit for explicit limits and non-stream requests. */
        automaticBudget?: number;
    },
): Promise<Response> {
    const BASE = "https://api.anthropic.com";
    const { conn, path } = opts;
    const url = (ctx.env.CLAUDE_CODE_BASE_API_URL || BASE).replace(/\/+$/, "") + path;
    let init = opts.init;
    let budget = opts.automaticBudget;
    while (true) {
        const res = await ctx.fns.models.provider.claude.claudeRequest({ conn, url, init });
        if (!res.ok && path === '/v1/messages') {
            let text = "";
            const parsed = await ctx.fns.models.inference.readErrorBody({ response: res, captureText: value => { text = value; } });
            if (budget !== undefined && res.status === 400 && typeof init.body === 'string') {
                init.signal?.throwIfAborted();
                const next = [64000, 32000, 16384].find(limit => limit < budget!);
                if (next !== undefined && rejectsOutputLimit(parsed)) {
                    budget = next;
                    const headers = new Headers(init.headers);
                    headers.set('x-client-request-id', crypto.randomUUID());
                    init = { ...init, headers, body: JSON.stringify({ ...JSON.parse(init.body), max_tokens: next }) };
                    continue;
                }
            }
            const headers = new Headers(init.headers);
            const secrets = [...headers.values(), (headers.get('authorization') ?? '').replace(/^Bearer /i, '')];
            const request: unknown = typeof init.body === 'string' ? init.body : undefined;
            return ctx.fns.models.provider.claude.claudeWireFailure({ conn, body: text, status: res.status, h: res.headers, request, secrets });
        }
        if (!res.ok) return ctx.fns.models.provider.claude.claudeWireFailure({ conn: conn, body: await res.text(), h: res.headers, status: res.status });
        return res;
    }

    function rejectsOutputLimit(body: unknown): boolean {
        const error = (body as { error?: { type?: unknown; message?: unknown } } | null)?.error;
        if (error?.type !== 'invalid_request_error' || typeof error.message !== 'string') return false;
        // Match the rejected field itself, not an input/context overflow mentioning it.
        return /^\s*[`'"]?max_tokens[`'"]?(?:\s*:\s*|\s+)(?:\d+\s+)?(?:>\s*\d+\b|must be <=\s*\d+\b|(?:is too (?:large|high)|is greater than|exceeds (?:the )?(?:maximum|limit)|must be (?:less than(?: or equal to)?|at most)|must not exceed|cannot exceed)\b)/i.test(error.message);
    }
}
