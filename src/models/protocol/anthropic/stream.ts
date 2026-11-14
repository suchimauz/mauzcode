/**
 * Stream one Anthropic Messages generation through a provider-supplied endpoint
 *
 * Shared anthropic protocol strategy for ProviderDefinition.stream implementations. Converts the OpenAI-shaped transcript with llm.toAnthropicMessages, sends POST {base}/messages with stream:true, the instructions as system, max_tokens (maxTokens, default 4096) and optional temperature and tools. responseFormat is applied as a JSON-only instruction appended to the system prompt. Reports text, thinking and tool argument deltas and returns a StreamResult (end_turn/stop_sequence → stop, max_tokens → length, tool_use → tool_calls). HTTP errors become classified SDK failures; a missing message_stop or malformed stream fails with acceptance uncertain.
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
    const label = "Anthropic Messages";
    const DEFAULT_MAX_TOKENS = 4096;
    const transcript = (req.messages as Record<string, unknown>[]).filter(m => m.role !== "system");
    const messages = ctx.fns.models.protocol.anthropic.toAnthropicMessages({ messages: transcript });
    const json = req.responseFormat ? ctx.fns.models.inference.structured({ action: "instruction", format: req.responseFormat }) : "";
    const system = [req.instructions, json].filter(Boolean).join("\n\n");
    const body: Record<string, unknown> = {
        model: req.model, messages, stream: true, max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(system ? { system } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.tools?.length ? { tools: req.tools } : {}),
    };
    const res = await ctx.fns.models.protocol.common.streamFetch({ fetch: opts.fetch, url: opts.endpoint.base + "/messages", headers: opts.endpoint.headers, body, label, signal });
    let text = "", thinking = "", stop: string | null = null, terminal = false;
    const usage: types.models.StreamResult["usage"] = {};
    const tools = ctx.fns.models.protocol.common.collectToolCalls({ onEvent: req.onEvent });
    const setUsage = (u: Record<string, number | undefined> | undefined) => {
        if (!u) return;
        if (u.output_tokens != null) usage.completion_tokens = u.output_tokens;
        if (u.input_tokens != null) usage.prompt_tokens = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        if (u.cache_read_input_tokens != null) usage.cache_read_tokens = u.cache_read_input_tokens;
        if (u.cache_creation_input_tokens != null) usage.cache_write_tokens = u.cache_creation_input_tokens;
    };
    try {
        for await (const frame of ctx.fns.models.transport.parseSSE({ body: res.body })) {
            if (!frame.data || frame.data === "[DONE]") continue;
            let ev: Record<string, any>;
            try { ev = JSON.parse(frame.data); } catch { throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "malformed" }); }
            const type = ev.type ?? frame.event;
            if (type === "error") throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "error" });
            if (type === "message_stop") { terminal = true; break; }
            if (type === "message_start") setUsage(ev.message?.usage);
            else if (type === "message_delta") { if (ev.delta?.stop_reason) stop = ev.delta.stop_reason; setUsage(ev.usage); }
            else if (type === "content_block_start" && ev.content_block?.type === "tool_use") tools.start(String(ev.index ?? 0), ev.content_block.id ?? "", ev.content_block.name ?? "");
            else if (type === "content_block_delta") {
                const d = ev.delta ?? {};
                if (d.type === "text_delta" && typeof d.text === "string") { text += d.text; req.onEvent?.({ type: "text_delta", delta: d.text }); }
                else if (d.type === "thinking_delta" && typeof d.thinking === "string") { thinking += d.thinking; req.onEvent?.({ type: "thinking_delta", delta: d.thinking, visibility: "public_summary" }); }
                else if (d.type === "input_json_delta" && typeof d.partial_json === "string") tools.append(String(ev.index ?? 0), d.partial_json);
            }
        }
    } catch (error) {
        if (signal?.aborted || (error && typeof error === "object" && "failure" in error)) throw error;
        throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "ended" });
    }
    if (!terminal) throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "ended" });
    const finishReason = stop === "end_turn" || stop === "stop_sequence" ? "stop" : stop === "max_tokens" ? "length" : stop === "tool_use" ? "tool_calls" : stop;
    return { text, thinking, finishReason, usage, toolCalls: tools.finish() };
}
