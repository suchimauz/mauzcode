/**
 * Choose the Qwen subscription Chat Completions endpoint and bearer header for one model request
 *
 * Protocol-route adapter of the qwen provider, called only by models.stream. Always returns the shared `openai-chat` protocol at https://api.qwen.ai/compatible-mode/v1 with a currently valid bearer token (refreshed through the transport when needed); never falls back to DashScope, the Alibaba Coding Plan or the discontinued free-tier endpoints. Throws LOGIN_REQUIRED without network when no usable login exists.
 * @param opts.conn Resolved qwen connection.
 * @param opts.model Qwen model id.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection. */
        conn: types.models.ResolvedConnection;
        /** Qwen model id. */
        model: string;
    },
): Promise<types.models.ProtocolRoute> {
    const k = ctx.fns.models.provider.qwen.constants({});
    return { protocol: "openai-chat", baseUrl: k.apiBase, headers: await ctx.fns.models.provider.qwen.headers({ conn: opts.conn }) };
}
