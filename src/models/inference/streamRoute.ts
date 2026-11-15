/**
 * Stream one inference turn for a protocol-route provider through the shared protocol it selects.
 *
 * Use only from models.inference.stream after every enabled, input, reasoning and capability check, for providers declaring ProviderDefinition.route instead of stream. Calls the provider's route with the model id, its cached ModelInfo and the session id, rejects a protocol outside the shared registry with INVALID_INPUT before any request, validates the base through the protocol's baseUrl, merges headers case-insensitively (Accept application/json, protocol defaultHeaders, then provider headers), validates any optional route body as a JSON object that touches no protocol-owned field and forwards body plus replayReasoning on the endpoint, then delegates to Protocol.stream over the connection's transport-bound fetch; never makes a direct request.
 * @param opts.definition Registered provider definition declaring route.
 * @param opts.conn Resolved connection bound to its saved transport.
 * @param opts.req Gated stream request, including SDK-resolved reasoning when the provider opted in.
 * @param opts.info Cached model metadata for req.model, or null when the model is not cached.
 */
/** Request body fields the shared protocols own; a provider route may never set them. */
const PROTOCOL_OWNED_BODY_KEYS = new Set([
    "model", "messages", "stream", "stream_options", "tools", "max_tokens",
    "temperature", "response_format", "reasoning_effort",
]);
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Registered provider definition declaring route. */
        definition: types.models.ProviderDefinition;
        /** Resolved connection bound to its saved transport. */
        conn: types.models.ResolvedConnection;
        /** Gated stream request, including SDK-resolved reasoning when the provider opted in. */
        req: types.models.StreamRequest;
        /** Cached model metadata for req.model, or null when the model is not cached. */
        info: types.models.ModelInfo | null;
    },
): Promise<types.models.StreamResult> {
    const { definition, conn, req } = opts;
        if (!definition.route) throw Object.assign(new Error("Provider " + definition.id + " does not support stream"), { code: "UNSUPPORTED", status: 400, retryable: false });
        const route = await definition.route(ctx, conn, { model: req.model, info: opts.info, sessionId: req.sessionId, ...(req.reasoning ? { reasoning: req.reasoning } : {}) });
        const ids = ctx.fns.models.protocol.list({}).map(p => p.id);
        const invalid = (message: string) => ctx.fns.models.inference.failure({ message, status: 400, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
        if (!route || typeof route.protocol !== "string" || !ids.includes(route.protocol)) throw invalid("Provider " + definition.id + " routed to an unsupported protocol");
        if (typeof route.baseUrl !== "string" || !route.headers || typeof route.headers !== "object" || Array.isArray(route.headers) || Object.values(route.headers).some(value => typeof value !== "string")) throw invalid("Provider " + definition.id + " returned an invalid route");
        const protocol = ctx.fns.models.protocol.get({ id: route.protocol });
        let base: string;
        const headers = new Headers({ Accept: "application/json" });
        try {
            base = protocol.baseUrl(ctx, route.baseUrl);
            for (const [name, value] of Object.entries(protocol.defaultHeaders())) headers.set(name, value);
            for (const [name, value] of Object.entries(route.headers)) headers.set(name, value);
        } catch {
            // URL/header parser errors can include credentials; expose only a fixed safe failure.
            throw invalid("Provider " + definition.id + " returned an invalid route");
        }
        // Optional provider body extras are additive only: a JSON object that never touches a
        // field the shared protocol owns. Validated before any request is built or sent.
        const body = route.body;
        if (body !== undefined) {
            if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("Provider " + definition.id + " returned an invalid route body");
            let keys: string[];
            try { keys = Object.keys(JSON.parse(JSON.stringify(body)) as Record<string, unknown>); }
            catch { throw invalid("Provider " + definition.id + " returned an invalid route body"); }
            if (keys.some(key => PROTOCOL_OWNED_BODY_KEYS.has(key))) throw invalid("Provider " + definition.id + " route body overrides a protocol-owned field");
        }
        req.signal?.throwIfAborted();
        const endpoint: types.models.ProtocolEndpoint = {
            base,
            headers: Object.fromEntries(headers),
            ...(body !== undefined ? { body } : {}),
            ...(route.replayReasoning === true ? { replayReasoning: true } : {}),
        };
        return protocol.stream(ctx, { fetch: conn.fetch, endpoint, request: req, ...(req.signal ? { signal: req.signal } : {}) });
}
