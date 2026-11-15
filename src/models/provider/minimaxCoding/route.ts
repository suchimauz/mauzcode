/**
 * Choose the MiniMax M Plan shared protocol route for one model request
 *
 * Protocol-route adapter of the minimax-coding provider, called only by models.stream. Every request goes to the fixed Anthropic-compatible gateway base https://api.minimax.io/anthropic authenticated with x-api-key, never to the pay-as-you-go API or another provider. serverMaxTokens drops the protocol's output budget because MiniMax counts thinking inside max_tokens and answers end_turn when it is omitted; replayReasoning asks the shared protocol to return stored signed thinking blocks on tool-call turns. Every model except MiniMax-M3.1-Flash receives the connection's service tier as service_tier (Flash rejects a tier), from the connection's saved field. Throws a safe error without contacting the network when no key is stored.
 * @param opts.conn Resolved minimax-coding connection supplying the apiKey secret, the serviceTier field and transport-bound fetch.
 * @param opts.model M Plan model id.
 * @param opts.info Cached discovery metadata for the model, or null.
 * @param opts.sessionId Request session id; M Plan requests carry no session header.
 * @param opts.reasoning SDK-resolved reasoning for this turn; the shared protocol applies it, the route only branches on the family.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved minimax-coding connection supplying the apiKey secret, the serviceTier field and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
        /** M Plan model id. */
        model: string;
        /** Cached discovery metadata for the model, or null. */
        info: types.models.ModelInfo | null;
        /** Request session id; M Plan requests carry no session header. */
        sessionId?: string;
        /** SDK-resolved reasoning for this turn; the shared protocol applies it, the route only branches on the family. */
        reasoning?: { applied: string } | null;
    },
): Promise<types.models.ProtocolRoute> {
    const _ctx = ctx;
    const _session = session;
    const headers = await ctx.fns.models.provider.minimaxCoding.headers({ conn: opts.conn });
    const flash = ctx.fns.models.provider.minimaxCoding.isFlash({ model: opts.model });
    return {
        protocol: "anthropic",
        baseUrl: "https://api.minimax.io/anthropic",
        headers,
        serverMaxTokens: true,
        replayReasoning: true,
        ...(flash ? {} : { body: { service_tier: opts.conn.config.serviceTier === "priority" ? "priority" : "standard" } }),
    };
}
