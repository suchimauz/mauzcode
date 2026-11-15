/**
 * Choose the Z.ai Coding Plan shared protocol, base URL and headers for one model request
 *
 * Protocol-route adapter of the zai-coding provider, called only by models.stream. Uses the connection's configured protocol on its fixed Coding Plan base (Chat Completions on /api/coding/paas/v4, Anthropic Messages on /api/anthropic) and never falls back to the standard pay-as-you-go API. A GLM-5.3 model on an openai-chat connection with applied reasoning other than auto additionally asks the shared protocol for the vendor's explicit thinking form and reasoning replay. Throws a safe error without contacting the network when no key is stored.
 * @param opts.conn Resolved zai-coding connection supplying the apiKey secret and transport-bound fetch.
 * @param opts.model Coding Plan model id.
 * @param opts.info Cached discovery metadata for the model, or null.
 * @param opts.sessionId Request session id; Coding Plan requests carry no session header.
 * @param opts.reasoning SDK-resolved reasoning for this turn, when the request opted in.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved zai-coding connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
        /** Coding Plan model id. */
        model: string;
        /** Cached discovery metadata for the model, or null. */
        info: types.models.ModelInfo | null;
        /** Request session id; Coding Plan requests carry no session header. */
        sessionId?: string;
        /** SDK-resolved reasoning for this turn; only its applied level decides the thinking extras. */
        reasoning?: { applied: string } | null;
    },
): Promise<types.models.ProtocolRoute> {
    const _ctx = ctx;
    const protocol = String(opts.conn.config.protocol) === "anthropic" ? "anthropic" : "openai-chat";
    const headers = await ctx.fns.models.provider.zaiCoding.headers({ conn: opts.conn, protocol });
    const baseUrl = protocol === "anthropic" ? "https://api.z.ai/api/anthropic" : "https://api.z.ai/api/coding/paas/v4";
    // GLM-5.3 on Chat Completions wants the vendor's explicit thinking switch and refuses a
    // tool-call turn whose replayed assistant message lost its reasoning_content.
    const thinking = protocol === "openai-chat" && ctx.fns.models.provider.zaiCoding.isGlm53({ model: opts.model })
        && opts.reasoning && opts.reasoning.applied !== "auto";
    return {
        protocol,
        baseUrl,
        headers,
        ...(thinking ? { body: { thinking: { type: "enabled" } }, replayReasoning: true } : {}),
    };
}
