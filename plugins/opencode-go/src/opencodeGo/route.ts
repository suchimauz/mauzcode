/**
 * Choose the OpenCode Go shared protocol, base URL and headers for one model request.
 *
 * Protocol-route adapter of the opencode-go provider, called only by models.stream. Uses the model's cached native protocol (openai-chat and openai-responses on /inference/go/openai/v1, anthropic on /inference/go/anthropic/v1, gemini on /inference/go/google/v1beta) and Chat Completions when the model is not cached, which Console translates. Adds authentication and the x-opencode-session header; never falls back to pay-as-you-go endpoints.
 * @param opts.conn Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch.
 * @param opts.model OpenCode Go model id.
 * @param opts.info Cached discovery metadata for the model, or null.
 * @param opts.sessionId Request session id sent as x-opencode-session.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
        /** OpenCode Go model id. */
        model: string;
        /** Cached discovery metadata for the model, or null. */
        info: types.models.ModelInfo | null;
        /** Request session id sent as x-opencode-session. */
        sessionId: string;
    },
): Promise<types.models.ProtocolRoute> {
    const protocol: types.models.ProtocolRoute["protocol"] = opts.info?.protocol ?? "openai-chat";
        const base = "https://opencode.ai/inference/go";
        const baseUrl = protocol === "anthropic" ? base + "/anthropic/v1" : protocol === "gemini" ? base + "/google/v1beta" : base + "/openai/v1";
        return { protocol, baseUrl, headers: await ctx.fns.opencodeGo.headers({ conn: opts.conn, sessionId: opts.sessionId }) };
}
