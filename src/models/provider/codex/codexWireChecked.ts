/**
 * Check Codex HTTP response status and classify safe provider failures.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Original outgoing request used only to suppress echoed input. */
        request?: unknown;
        /** Request credential and routing values to suppress. */
        secrets?: string[];
        /** conn input used by the codex checked protocol helper. */
        conn: types.models.ResolvedConnection;
        /** res input used by the codex checked protocol helper. */
        res: Response;
        /** Credentials that issued the request, never reread on a 401. */
        auth: { generation: string | null; credentialRevision: number };
    },
): Promise<Response> {
    const { conn, res } = opts;
    
        if (res.ok) return res;
        const body = await ctx.fns.models.inference.readErrorBody({ response: res });
        const parsed = body && typeof body === 'object' ? body as Record<string, unknown> : null;
        const error = parsed?.error && typeof parsed.error === 'object' ? parsed.error as Record<string, unknown> : parsed;
        if (res.status === 401) await ctx.fns.models.provider.codex.codexAuth({ conn, op: "markLogin", auth: opts.auth });
        const f = ctx.fns.models.provider.codex.codexFailure({ phase: "http", status: res.status, error, retryAfter: res.headers.get("retry-after") });
        if (opts.request === undefined) throw ctx.fns.models.inference.failure(f); // non-inference check
        const diagnostic = ctx.fns.models.inference.providerDiagnostic({ provider: 'codex', stage: 'http', status: res.status, body, request: opts.request, secrets: opts.secrets });
        throw ctx.fns.models.inference.failure({ ...f, message: diagnostic.summary, info: { ...f.info, diagnostic } });
}
