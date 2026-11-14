/**
 * Stream one OpenAI Responses generation through a provider-supplied endpoint
 *
 * Shared openai-responses protocol strategy for ProviderDefinition.stream implementations. Converts the OpenAI-shaped transcript into Responses input items (user text/images, assistant output_text and function_call, tool function_call_output), sends POST {base}/responses with stream:true and store:false, instructions, optional tools, temperature, max_output_tokens (maxTokens) and text.format (responseFormat). Reports text, reasoning summary and function argument deltas and returns a StreamResult (incomplete for max_output_tokens → length, function calls → tool_calls). HTTP errors become classified SDK failures; a missing response.completed or malformed stream fails with acceptance uncertain.
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
    const label = "OpenAI Responses";
    type Part = { type?: string; text?: string; data?: string; mimeType?: string };
    const partsOf = (content: unknown): Part[] => typeof content === "string" ? (content ? [{ type: "text", text: content }] : [])
        : Array.isArray(content) ? (content as Part[]).filter(p => p?.type === "text" && typeof p.text === "string" || p?.type === "image" && typeof p.data === "string")
        : content == null ? [] : [{ type: "text", text: JSON.stringify(content) }];
    const input: Record<string, unknown>[] = [];
    for (const raw of req.messages as Record<string, any>[]) {
        if (raw.role === "system") continue;
        const parts = partsOf(raw.content);
        if (raw.role === "tool") {
            input.push({ type: "function_call_output", call_id: raw.tool_call_id, output: parts.filter(p => p.type === "text").map(p => p.text).join("\n") });
            continue;
        }
        if (raw.role === "assistant") {
            const t = parts.filter(p => p.type === "text").map(p => p.text).join("\n");
            if (t) input.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: t }] });
            for (const c of Array.isArray(raw.tool_calls) ? raw.tool_calls : []) input.push({ type: "function_call", call_id: c.id, name: c.name, arguments: JSON.stringify(c.args ?? {}) });
            continue;
        }
        const content = parts.map(p => p.type === "image" ? { type: "input_image", image_url: `data:${p.mimeType};base64,${p.data}` } : { type: "input_text", text: p.text });
        if (content.length) input.push({ type: "message", role: "user", content });
    }
    const format = req.responseFormat;
    const body: Record<string, unknown> = {
        model: req.model, input, stream: true, store: false,
        ...(req.instructions ? { instructions: req.instructions } : {}),
        ...(req.tools?.length ? { tools: ctx.fns.models.protocol.openaiResponses.toTools({ tools: req.tools }) } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { max_output_tokens: req.maxTokens } : {}),
        ...(format ? { text: { format: format.type === "json_schema" ? { type: "json_schema", name: format.name, schema: format.schema, strict: format.strict ?? true } : { type: "json_object" } } } : {}),
    };
    const res = await ctx.fns.models.protocol.common.streamFetch({ fetch: opts.fetch, url: opts.endpoint.base + "/responses", headers: opts.endpoint.headers, body, label, signal });
    let text = "", thinking = "", finish: string | null = null, completed = false;
    const usage: types.models.StreamResult["usage"] = {};
    const tools = ctx.fns.models.protocol.common.collectToolCalls({ onEvent: req.onEvent });
    try {
        for await (const frame of ctx.fns.models.transport.parseSSE({ body: res.body })) {
            if (!frame.data || frame.data === "[DONE]") continue;
            let ev: Record<string, any>;
            try { ev = JSON.parse(frame.data); } catch { throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "malformed" }); }
            const type = ev.type ?? frame.event;
            if (type === "error" || type === "response.failed") throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "error" });
            if (type === "response.output_text.delta" && typeof ev.delta === "string") { text += ev.delta; req.onEvent?.({ type: "text_delta", delta: ev.delta }); }
            else if ((type === "response.reasoning_summary_text.delta" || type === "response.reasoning_text.delta") && typeof ev.delta === "string") { thinking += ev.delta; req.onEvent?.({ type: "thinking_delta", delta: ev.delta, visibility: "public_summary" }); }
            else if (type === "response.output_item.added" && ev.item?.type === "function_call") tools.start(String(ev.item.id ?? ev.output_index), ev.item.call_id ?? "", ev.item.name ?? "");
            else if (type === "response.function_call_arguments.delta" && typeof ev.delta === "string") tools.append(String(ev.item_id ?? ev.output_index), ev.delta);
            else if (type === "response.completed" || type === "response.incomplete") {
                completed = true;
                const u = ev.response?.usage;
                if (u) {
                    if (typeof u.input_tokens === "number") usage.prompt_tokens = u.input_tokens;
                    if (typeof u.output_tokens === "number") usage.completion_tokens = u.output_tokens;
                    if (typeof u.input_tokens_details?.cached_tokens === "number") usage.cache_read_tokens = u.input_tokens_details.cached_tokens;
                }
                finish = type === "response.incomplete" ? (ev.response?.incomplete_details?.reason === "max_output_tokens" ? "length" : String(ev.response?.incomplete_details?.reason ?? "incomplete")) : "stop";
                break;
            }
        }
    } catch (error) {
        if (signal?.aborted || (error && typeof error === "object" && "failure" in error)) throw error;
        throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "ended" });
    }
    if (!completed) throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "ended" });
    const toolCalls = tools.finish();
    return { text, thinking, finishReason: finish === "stop" && toolCalls.length ? "tool_calls" : finish, usage, toolCalls };
}
