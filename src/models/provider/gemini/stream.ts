/**
 * Stream one Gemini generation through the Code Assist API
 *
 * The SDK stream of the gemini provider. Ensures Code Assist setup (lazy, single-flight; LOGIN_REQUIRED without a usable login, before any request), builds the shared Gemini request with protocol.gemini.buildRequest without its reasoning mapping, sets the provider's own thinkingConfig (models.provider.gemini.thinkingConfig), adds the placeholder signature to unsigned replayed function-call turns, and POSTs `{ model, project, user_prompt_id, request: { ...body, session_id } }` to `v1internal:streamGenerateContent?alt=sse` through conn.fetch with a bearer token and the Gemini CLI User-Agent. Failed responses are classified by models.provider.gemini.failure (a 401 invalidates the token without replay). Each SSE event's `response` is read with protocol.gemini.readStream, so text, thought and tool-argument deltas, usage, finish reasons and per-call thought signatures follow the shared gemini rules; a stream without a finish reason fails retryable with acceptance uncertain.
 * @param opts.conn Resolved gemini connection.
 * @param opts.req SDK streaming request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection. */
        conn: types.models.ResolvedConnection;
        /** SDK streaming request. */
        req: types.models.StreamRequest;
    },
): Promise<types.models.StreamResult> {
    const { conn, req } = opts;
    const k = ctx.fns.models.provider.gemini.constants({});
    const label = "Gemini Code Assist";
    const model = req.model.replace(/^models\//, "");
    req.signal?.throwIfAborted();
    const { projectId } = await ctx.fns.models.provider.gemini.setup({ conn });
    const built = await ctx.fns.models.protocol.gemini.buildRequest({ request: req, omitReasoning: true });
    const thinking = ctx.fns.models.provider.gemini.thinkingConfig({ model, ...(req.reasoning ? { reasoning: req.reasoning } : {}) });
    const generationConfig = { ...(built.generationConfig ?? {}), ...(thinking ? { thinkingConfig: thinking } : {}) };
    const request: Record<string, unknown> = {
        ...built,
        contents: ctx.fns.models.provider.gemini.signContents({ contents: built.contents }),
        ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
        session_id: req.sessionId,
    };
    const body = { model, project: projectId, user_prompt_id: ctx.fns.models.provider.gemini.promptId({ sessionId: req.sessionId, messages: req.messages }), request };
    const headers = await ctx.fns.models.provider.gemini.headers({ conn, model });
    const res = await ctx.fns.models.protocol.common.streamFetch({
        fetch: conn.fetch, url: k.apiBase + "/" + k.apiVersion + ":streamGenerateContent?alt=sse", headers, body, label, signal: req.signal,
        classifyFailure: input => ctx.fns.models.provider.gemini.failure({ conn, status: input.status, body: input.body, model }),
    });
    const result = await ctx.fns.models.protocol.gemini.readStream({ body: res.body, request: req, label, signal: req.signal, unwrap: true });
    return { ...result, ...(req.reasoning ? { reasoning: req.reasoning } : {}) };
}
