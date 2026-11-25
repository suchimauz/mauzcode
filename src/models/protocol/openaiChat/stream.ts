/**
 * Stream one OpenAI Chat Completions generation through a provider-supplied endpoint
 *
 * Shared openai-chat protocol strategy for ProviderDefinition.stream implementations. Converts the OpenAI-shaped transcript (instructions become a leading system message; endpoint.replayReasoning replays stored assistant reasoning on tool-call turns), sends POST {base}/chat/completions with stream:true and include_usage, maps temperature, maxTokens (max_tokens) and responseFormat (response_format), merges the endpoint's optional extra body fields after the protocol's own fields without overriding them, reports text, reasoning_content and tool argument deltas, and returns a StreamResult with finish reason stop, length, tool_calls or the upstream value. HTTP errors become classified SDK failures; a cut-off or malformed stream fails STREAM_INTERRUPTED with acceptance uncertain. SDK-resolved reasoning (opted-in providers) is sent as reasoning_effort using its wire value; applied auto, and off without a wire value, send nothing.
 * @param opts.fetch Transport-bound fetch of the connection.
 * @param opts.endpoint Provider-built versioned base, headers and optional extra body fields.
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
    const label = "OpenAI Chat";
    const transcript = (req.messages as Record<string, unknown>[]).filter(m => m.role !== "system");
    const messages = [...(req.instructions ? [{ role: "system", content: req.instructions }] : []), ...ctx.fns.models.protocol.openaiChat.toOpenAIMessages({ messages: transcript, replayReasoning: opts.endpoint.replayReasoning === true })];
    const format = req.responseFormat;
    // SDK-resolved reasoning only reaches opted-in providers; auto sends nothing.
    // Off has no OpenAI-native name unless the capabilities declare one (e.g. "none"); otherwise it is omitted.
    const r = req.reasoning && req.reasoning.applied !== "auto" ? req.reasoning : null;
    const effort = r && (r.applied !== "off" || r.wire) ? r.wire ?? r.applied : null;
    const body: Record<string, unknown> = {
        model: req.model, messages, stream: true, stream_options: { include_usage: true },
        ...(req.tools?.length ? { tools: ctx.fns.models.protocol.openaiChat.toTools({ tools: req.tools }) } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        ...(effort ? { reasoning_effort: effort } : {}),
        ...(format?.type === "json_object" ? { response_format: { type: "json_object" } } : {}),
        ...(format?.type === "json_schema" ? { response_format: { type: "json_schema", json_schema: { name: format.name, schema: format.schema, strict: format.strict ?? true } } } : {}),
        // Provider extras validated by models.inference.streamRoute: they add fields, never replace
        // the protocol's own model/messages/stream/tools/sampling/reasoning fields.
        ...(opts.endpoint.body ?? {}),
    };
    const provider = opts.endpoint.provider ?? "openai-chat";
    const sensitive = { request: body, secrets: Object.values(opts.endpoint.headers) };
    const res = await ctx.fns.models.protocol.common.streamFetch({ provider, classifyFailure: opts.classifyFailure, fetch: opts.fetch, url: opts.endpoint.base + "/chat/completions", headers: opts.endpoint.headers, body, label, signal });
    let text = "", thinking = "", finish: string | null = null, done = false;
    const usage: types.models.StreamResult["usage"] = {};
    const tools = ctx.fns.models.protocol.common.collectToolCalls({ onEvent: req.onEvent });
    try {
        for await (const frame of ctx.fns.models.transport.parseSSE({ body: res.body })) {
            if (frame.data === "[DONE]") { done = true; break; }
            let ev: Record<string, any>;
            try { ev = JSON.parse(frame.data); } catch { throw ctx.fns.models.protocol.common.streamInterrupted({ provider, ...sensitive, label, reason: "malformed" }); }
            if (ev.error) throw ctx.fns.models.protocol.common.streamInterrupted({ provider, ...sensitive, label, body: ev, reason: "error" });
            if (ev.usage) {
                if (typeof ev.usage.prompt_tokens === "number") usage.prompt_tokens = ev.usage.prompt_tokens;
                if (typeof ev.usage.completion_tokens === "number") usage.completion_tokens = ev.usage.completion_tokens;
                const cached = ev.usage.prompt_tokens_details?.cached_tokens;
                if (typeof cached === "number") usage.cache_read_tokens = cached;
            }
            const choice = ev.choices?.[0];
            if (!choice) continue;
            const d = choice.delta ?? {};
            if (typeof d.content === "string" && d.content) { text += d.content; req.onEvent?.({ type: "text_delta", delta: d.content }); }
            const r = typeof d.reasoning_content === "string" ? d.reasoning_content : typeof d.reasoning === "string" ? d.reasoning : "";
            if (r) { thinking += r; req.onEvent?.({ type: "thinking_delta", delta: r, visibility: "public_summary" }); }
            for (const call of Array.isArray(d.tool_calls) ? d.tool_calls : []) {
                const slot = String(call.index ?? 0);
                tools.start(slot, call.id ?? "", call.function?.name ?? "");
                if (typeof call.function?.arguments === "string") tools.append(slot, call.function.arguments);
            }
            if (choice.finish_reason) finish = String(choice.finish_reason);
        }
    } catch (error) {
        if (signal?.aborted || (error && typeof error === "object" && "failure" in error)) throw error;
        throw ctx.fns.models.protocol.common.streamInterrupted({ provider, ...sensitive, label, reason: "ended" });
    }
    if (!done && finish === null) throw ctx.fns.models.protocol.common.streamInterrupted({ provider, ...sensitive, label, reason: "ended" });
    const toolCalls = tools.finish();
    return { text, thinking, finishReason: finish === "stop" && toolCalls.length ? "tool_calls" : finish, usage, toolCalls };
}
