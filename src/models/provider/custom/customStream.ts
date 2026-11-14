/**
 * Stream one inference turn for a custom connection through its configured shared protocol
 *
 * Stream operation of the custom provider: rejects any providerOptions with INVALID_INPUT, selects the shared protocol from config.protocol (openai-chat, openai-responses, anthropic or gemini) through models.protocol.get, builds the endpoint with models.provider.custom.customEndpoint and delegates to Protocol.stream over the connection's transport-bound fetch. Use only through models.stream / models.call, which apply enabled checks and capability gating first.
 * @param opts.conn Resolved custom connection supplying config.baseUrl, config.protocol and the apiKey secret.
 * @param opts.req Streaming request after SDK validation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved custom connection supplying config.baseUrl, config.protocol and the apiKey secret. */
        conn: types.models.ResolvedConnection;
        /** Streaming request after SDK validation. */
        req: types.models.StreamRequest;
    },
): Promise<types.models.StreamResult> {
    const { conn, req } = opts;
    ctx.fns.models.inference.rejectProviderOptions({ provider: "custom", providerOptions: req.providerOptions });
    const protocol = ctx.fns.models.protocol.get({ id: String(conn.config.protocol) });
    const endpoint = await ctx.fns.models.provider.custom.customEndpoint({ conn, protocol });
    return protocol.stream(ctx, { fetch: conn.fetch, endpoint, request: req, ...(req.signal ? { signal: req.signal } : {}) });
}
