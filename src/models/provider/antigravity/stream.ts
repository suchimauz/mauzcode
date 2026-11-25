/**
 * Stream one Gemini generation through the signed-in Antigravity account
 *
 * The SDK stream of the antigravity provider. Requires a usable sign-in (LOGIN_REQUIRED before any request),
 * resolves the account project, builds the inner Gemini request with models.protocol.gemini.buildRequest (without
 * its reasoning mapping), sets `thinkingConfig.thinkingLevel` from the SDK-resolved level (its wire value when
 * declared) with thoughts included, and POSTs `{ project, model, request: { …, sessionId }, requestType: "agent",
 * userAgent: "antigravity", requestId }` to `v1internal:streamGenerateContent?alt=sse` over the connection transport
 * with the account's bearer token and the Hub User-Agent. Failed responses are classified by
 * models.provider.antigravity.failure; each wrapped SSE event's `response` is read with
 * models.protocol.gemini.readStream, so text, thoughts, tool calls with their own thought signatures, usage and
 * finish status follow the shared Gemini rules and an interrupted or malformed stream fails with acceptance
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
    const built = await ctx.fns.models.protocol.gemini.buildRequest({ request: req, omitReasoning: true });
    const applied = req.reasoning?.applied;
    const level = applied && applied !== "auto" && applied !== "off" ? req.reasoning!.wire ?? applied : undefined;
    const generationConfig = { ...(built.generationConfig ?? {}), ...(level ? { thinkingConfig: { thinkingLevel: level, includeThoughts: true } } : {}) };
    const request: Record<string, unknown> = { ...built, ...(Object.keys(generationConfig).length ? { generationConfig } : {}), sessionId: req.sessionId };
    const body = { project, model: req.model, request, requestType: "agent", userAgent: "antigravity", requestId: "agent-" + crypto.randomUUID() };
    const url = k.apiBase + ":streamGenerateContent?alt=sse";
    const res = await ctx.fns.models.protocol.common.streamFetch({
        provider: "antigravity",
        fetch: (u, init) => ctx.fns.models.provider.antigravity.request({ conn, url: u, init: init ?? {} }),
        url, headers: { authorization: "Bearer " + accessToken, "user-agent": k.userAgent }, body, label, signal: req.signal,
        classifyFailure: input => ctx.fns.models.provider.antigravity.failure({ conn, status: input.status, body: input.body, accessToken }),
    });
    await ctx.fns.models.provider.antigravity.auth({ conn, op: "accepted", accessToken }).catch(() => undefined);
    return ctx.fns.models.protocol.gemini.readStream({ provider: "antigravity", sensitive: { request: body, secrets: [accessToken] }, body: res.body, request: req, label, signal: req.signal, unwrap: true });
}
