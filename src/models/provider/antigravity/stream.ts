/**
 * Stream one Gemini or Claude generation through the signed-in Antigravity account
 *
 * The SDK stream of the antigravity provider. Requires a usable sign-in (LOGIN_REQUIRED before any request),
 * resolves the account project, builds the inner request in Gemini generateContent format for both families with
 * models.protocol.gemini.buildRequest (without its reasoning mapping) and sends no thinking setting: `req.model`
 * is the exact native id models.stream chose (a group's variant member or a standalone model), which already
 * fixes the level. For a Claude model (family from the cached catalogue, never from the name) every tool call's
 * own id is carried on its functionCall and functionResponse so results stay correlated, and a call the stream
 * returned without an id gets a unique one. POSTs `{ project, model, request: { …, sessionId }, requestType: "agent",
 * userAgent: "antigravity", requestId }` to `v1internal:streamGenerateContent?alt=sse` over the connection transport
 * with the account's bearer token and the Hub User-Agent. Failed responses are classified by
 * models.provider.antigravity.failure; each wrapped SSE event's `response` is read with
 * models.protocol.gemini.readStream, so text, thoughts, tool calls with their own thought signatures, usage and
 * finish status follow the shared Gemini rules (a function call keeps the provider's own call id for its result) and an interrupted or malformed stream fails with acceptance
 * uncertain. Never retries itself and never switches account, project or service.
 * @param opts.conn Resolved antigravity connection.
 * @param opts.req SDK streaming request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection. */
        conn: types.models.ResolvedConnection;
        /** SDK streaming request. */
        req: types.models.StreamRequest;
    },
): Promise<types.models.StreamResult> {
    const { conn, req } = opts;
    const k = ctx.fns.models.provider.antigravity.constants({});
    const label = "Antigravity";
    ctx.fns.models.inference.rejectProviderOptions({ provider: "antigravity", providerOptions: req.providerOptions });
    req.signal?.throwIfAborted();
    const project = await ctx.fns.models.provider.antigravity.project({ conn, signal: req.signal, inference: true });
    const accessToken = (await ctx.fns.models.provider.antigravity.auth({ conn, op: "token" })).accessToken!;
    const catalogue = await ctx.fns.models.catalog.listModels({ id: conn.id, cacheOnly: true });
    const claude = catalogue.models.some(m => m.family === "claude" && (m.id === req.model || m.reasoning?.variants?.members.some(v => v.id === req.model)));
    const built = await ctx.fns.models.protocol.gemini.buildRequest({ request: req, omitReasoning: true, ...(claude ? { callIds: true } : {}) });
    const request: Record<string, unknown> = { ...built, sessionId: req.sessionId };
    const body = { project, model: req.model, request, requestType: "agent", userAgent: "antigravity", requestId: "agent-" + crypto.randomUUID() };
    const url = k.apiBase + ":streamGenerateContent?alt=sse";
    const res = await ctx.fns.models.protocol.common.streamFetch({
        provider: "antigravity",
        fetch: (u, init) => ctx.fns.models.provider.antigravity.request({ conn, url: u, init: init ?? {} }),
        url, headers: { authorization: "Bearer " + accessToken, "user-agent": k.userAgent }, body, label, signal: req.signal,
        classifyFailure: input => ctx.fns.models.provider.antigravity.failure({ conn, status: input.status, body: input.body, accessToken }),
    });
    await ctx.fns.models.provider.antigravity.auth({ conn, op: "accepted", accessToken }).catch(() => undefined);
    const result = await ctx.fns.models.protocol.gemini.readStream({ provider: "antigravity", sensitive: { request: body, secrets: [accessToken] }, body: res.body, request: req, label, signal: req.signal, unwrap: true });
    // Claude correlates results by call id across the whole conversation: a call the stream left without its own id
    // gets a unique one instead of the reader's per-response position.
    if (claude) for (const call of result.toolCalls) if (/^call_\d+$/.test(call.id)) call.id = "toolu_" + crypto.randomUUID().replaceAll("-", "");
    return result;
}
