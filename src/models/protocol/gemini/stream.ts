/**
 * Stream one Gemini generateContent generation through a provider-supplied endpoint
 *
 * Shared gemini protocol strategy for ProviderDefinition.stream implementations. Converts the OpenAI-shaped transcript with llm.toGeminiContents, sends POST {base}/models/{model}:streamGenerateContent?alt=sse with systemInstruction, optional tools and generationConfig (temperature, maxOutputTokens from maxTokens, responseMimeType application/json and responseSchema from responseFormat). Reports text, thought and function-call argument deltas and returns a StreamResult (STOP → stop, MAX_TOKENS → length, function calls → tool_calls). HTTP errors become classified SDK failures; a stream without a finish reason or with malformed data fails with acceptance uncertain.
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
    },
): Promise<types.models.StreamResult> {
    const { request: req, signal } = opts;
    const label = "Gemini";
    const transcript = (req.messages as Record<string, any>[]).filter(m => m.role !== "system");
    const contents = await ctx.fns.models.protocol.gemini.toGeminiContents({ messages: transcript });
    const format = req.responseFormat;
    const generationConfig: Record<string, unknown> = {
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
        ...(format ? { responseMimeType: "application/json" } : {}),
        ...(format?.type === "json_schema" ? { responseSchema: format.schema } : {}),
    };
    const body: Record<string, unknown> = {
        contents,
        ...(req.instructions ? { systemInstruction: { parts: [{ text: req.instructions }] } } : {}),
        ...(req.tools?.length ? { tools: req.tools } : {}),
        ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
    };
    const model = encodeURIComponent(req.model.replace(/^models\//, ""));
    const res = await ctx.fns.models.protocol.common.streamFetch({ fetch: opts.fetch, url: opts.endpoint.base + "/models/" + model + ":streamGenerateContent?alt=sse", headers: opts.endpoint.headers, body, label, signal });
    let text = "", thinking = "", finish: string | null = null, calls = 0;
    const usage: types.models.StreamResult["usage"] = {};
    const tools = ctx.fns.models.protocol.common.collectToolCalls({ onEvent: req.onEvent });
    try {
        for await (const frame of ctx.fns.models.transport.parseSSE({ body: res.body })) {
            if (!frame.data) continue;
            let ev: Record<string, any>;
            try { ev = JSON.parse(frame.data); } catch { throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "malformed" }); }
            if (ev.error) throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "error" });
            const u = ev.usageMetadata;
            if (u) {
                if (typeof u.promptTokenCount === "number") usage.prompt_tokens = u.promptTokenCount;
                if (typeof u.candidatesTokenCount === "number" || typeof u.thoughtsTokenCount === "number") usage.completion_tokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
                if (typeof u.cachedContentTokenCount === "number") usage.cache_read_tokens = u.cachedContentTokenCount;
            }
            const candidate = ev.candidates?.[0];
            for (const part of candidate?.content?.parts ?? []) {
                if (typeof part.text === "string" && part.text) {
                    if (part.thought) { thinking += part.text; req.onEvent?.({ type: "thinking_delta", delta: part.text, visibility: "public_summary" }); }
                    else { text += part.text; req.onEvent?.({ type: "text_delta", delta: part.text }); }
                } else if (part.functionCall) {
                    const slot = String(calls++);
                    tools.start(slot, part.functionCall.id ?? `call_${slot}`, part.functionCall.name ?? "");
                    tools.append(slot, JSON.stringify(part.functionCall.args ?? {}));
                }
            }
            if (candidate?.finishReason) finish = String(candidate.finishReason);
        }
    } catch (error) {
        if (signal?.aborted || (error && typeof error === "object" && "failure" in error)) throw error;
        throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "ended" });
    }
    if (finish === null) throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "ended" });
    const toolCalls = tools.finish();
    const finishReason = toolCalls.length ? "tool_calls" : finish === "STOP" ? "stop" : finish === "MAX_TOKENS" ? "length" : finish.toLowerCase();
    return { text, thinking, finishReason, usage, toolCalls };
}
