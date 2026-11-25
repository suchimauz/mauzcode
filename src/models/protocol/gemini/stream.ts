/**
 * Stream one Gemini generateContent generation through a provider-supplied endpoint
 *
 * Shared gemini protocol strategy for ProviderDefinition.stream implementations. Converts the OpenAI-shaped transcript with llm.toGeminiContents, sends POST {base}/models/{model}:streamGenerateContent?alt=sse with systemInstruction, optional tools and generationConfig (temperature, maxOutputTokens from maxTokens, responseMimeType application/json and responseSchema from responseFormat). Reports text, thought and function-call argument deltas and returns a StreamResult (STOP → stop, MAX_TOKENS → length, function calls → tool_calls; each function call's thoughtSignature is returned on its tool call). HTTP errors become classified SDK failures; a stream without a finish reason or with malformed data fails with acceptance uncertain. SDK-resolved low/medium/high reasoning is sent as generationConfig.thinkingConfig.thinkingLevel; other levels send nothing.
 * @param opts.fetch Transport-bound fetch of the connection.
 * @param opts.endpoint Provider-built versioned base and headers.
 * @param opts.request Streaming request without checkpoint entries.
 * @param opts.signal Optional cancellation signal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Transport-bound fetch of the connection. */
        fetch: types.models.ResolvedConnection["fetch"];
        /** Provider-built versioned base and headers. */
        endpoint: types.models.ProtocolEndpoint;
        /** Streaming request without checkpoint entries. */
        request: types.models.StreamRequest;
        /** Optional cancellation signal. */
        signal?: AbortSignal;
        /** Optional provider failure classifier consulted on a failed response before the status rules. */
        classifyFailure?: types.models.ProtocolStreamClassify;
    },
): Promise<types.models.StreamResult> {
    const { request: req, signal } = opts;
    const label = "Gemini";
    const body = await ctx.fns.models.protocol.gemini.buildRequest({ request: req });
    const model = encodeURIComponent(req.model.replace(/^models\//, ""));
    const provider = opts.endpoint.provider ?? "gemini";
    const sensitive = { request: body, secrets: Object.values(opts.endpoint.headers) };
    const res = await ctx.fns.models.protocol.common.streamFetch({ provider, classifyFailure: opts.classifyFailure, fetch: opts.fetch, url: opts.endpoint.base + "/models/" + model + ":streamGenerateContent?alt=sse", headers: opts.endpoint.headers, body, label, signal });
    return ctx.fns.models.protocol.gemini.readStream({ provider, sensitive, body: res.body, request: req, label, signal });
}
