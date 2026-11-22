type Auth = Readonly<{ token: string; accountId: string | null; generation: string | null; credentialRevision: number }>;

/**
 * Send Codex Responses requests with required version and session identity headers.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** conn input used by the codex responses protocol helper. */
        conn: types.models.ResolvedConnection;
        /** a input used by the codex responses protocol helper. */
        a: Auth;
        /** Optional stream request carrying an SDK preflight or server-owned reply intent. Never set for compaction. */
        req?: types.models.StreamRequest;
        /** sessionId input used by the codex responses protocol helper. */
        sessionId: string;
        /** body input used by the codex responses protocol helper. */
        body: Record<string, unknown>;
        /** signal input used by the codex responses protocol helper. */
        signal?: AbortSignal;
        /** extra input used by the codex responses protocol helper. */
        extra?: Record<string, string>;
    },
): Promise<Response> {
    const BASE = "https://chatgpt.com/backend-api";

    const { conn, a, sessionId, body, signal, extra = {} } = opts;
    
        const headers: Record<string, string> = {
            authorization: `Bearer ${a.token}`,
            ...(a.accountId ? { "chatgpt-account-id": a.accountId } : {}),
            originator: "codex_cli_rs",
            version: await ctx.fns.models.provider.codex.codexVersion({ config: conn.config }),
            "OpenAI-Beta": "responses=experimental",
            accept: "text/event-stream",
            "content-type": "application/json",
            session_id: sessionId,
            "x-client-request-id": sessionId,
            ...extra,
        };
        if (signal?.aborted) throw ctx.fns.models.inference.failure({ message: "Request cancelled before dispatch", status: 499, info: { code: "CANCELLED", classification: "cancelled", acceptance: "none", retryable: false, replaySafe: true } });
        const req = opts.req;
        const dispatch = req && ctx.state.models?.codexDispatch?.get(req);
        const stale = () => ctx.fns.models.inference.failure({ message: "Codex authorization changed before dispatch", status: 409, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
        const init: RequestInit = { method: "POST", headers, signal };
        let handedOff = false;
        ((ctx.state.models ??= {}).codexHandoff ??= new WeakMap()).set(init, async send => {
            await ctx.fns.procs.db.transaction({ fn: async () => {
                const [row] = await ctx.fns.procs.db.select({ sql: `SELECT codex_generation, codex_credential_revision, CASE WHEN codex_generation=models_cache_generation THEN models_cache END AS models_cache FROM llm_connections WHERE id=? AND provider='codex' FOR UPDATE`, params: [conn.id] }) as { codex_generation: string | null; codex_credential_revision: string | number; models_cache: unknown }[];
                if (!row || row.codex_generation !== a.generation || Number(row.codex_credential_revision) !== a.credentialRevision || (dispatch?.generation !== undefined && dispatch.generation !== a.generation) || (dispatch?.pin?.generation !== undefined && dispatch.pin.generation !== a.generation)) throw stale();
                const cache = typeof row.models_cache === "string" ? JSON.parse(row.models_cache) : row.models_cache;
                const model = a.accountId && a.generation && Array.isArray(cache) ? (cache as types.models.ModelInfo[]).find(m => m.id === req?.model) : undefined;
                if (req && dispatch) {
                    if (model?.reasoningUnavailable) throw ctx.fns.models.inference.failure({ message: 'Catalogue provides no usable reasoning level', status: 400, info: { code: 'CAPABILITY_UNAVAILABLE', classification: 'capability_unavailable', acceptance: 'none', retryable: false, replaySafe: true } });
                    const reasoning = ctx.fns.models.inference.resolveReasoning({ model: req.model, preference: req.reasoningEffort, metadata: model?.reasoning ?? null, profile: ctx.fns.models.provider.codex.codexReasoningProfile({ model: req.model }) });
                    req.reasoning = reasoning;
                    if (reasoning.applied === 'auto') delete body.reasoning;
                    else body.reasoning = { effort: reasoning.applied === 'off' ? 'none' : reasoning.applied, summary: 'auto' };
                }
                const options = req && dispatch?.chat ? await dispatch.chat({ connectionId: conn.id, generation: a.generation, modelId: req.model }) : req?.providerOptions;
                const controls = ctx.fns.models.provider.codex.codexControls({ options, model });
                const wire = { ...body, ...(controls.service_tier ? { service_tier: controls.service_tier } : {}), ...(controls.verbosity ? { text: { ...(body.text as object), verbosity: controls.verbosity } } : {}) };
                signal?.throwIfAborted();
                if (handedOff) throw stale();
                if (dispatch?.pin) dispatch.pin.generation = a.generation;
                send(JSON.stringify(wire)); // synchronous transport handoff; never await network I/O under this lock
                handedOff = true;
            } });
        });
        let res: Response;
        try {
            res = await conn.fetch(`${BASE}/codex/responses`, init);
            if (!handedOff) throw stale();
        } catch (error) {
            throw ctx.fns.models.provider.codex.codexWireInterrupted({ error: error, signal: signal });
        }
        return ctx.fns.models.provider.codex.codexWireChecked({ conn, res, auth: a });
}
