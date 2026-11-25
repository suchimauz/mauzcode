/**
 * Stream one Anthropic Messages generation through a provider-supplied endpoint
 *
 * Reports text, thinking and tool argument deltas and returns a StreamResult (end_turn/stop_sequence → stop, max_tokens → length, tool_use → tool_calls) that also carries the complete thinking and redacted_thinking content blocks in order as reasoningBlocks.
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
    const label = "Anthropic Messages";
    const DEFAULT_MAX_TOKENS = 4096;
    const transcript = (req.messages as Record<string, unknown>[]).filter(m => m.role !== "system");
    const messages = ctx.fns.models.protocol.anthropic.toAnthropicMessages({
        messages: transcript,
        ...(opts.endpoint.replayReasoning === true ? { replayReasoning: true } : {}),
        ...(opts.endpoint.origin ? { origin: opts.endpoint.origin } : {}),
    });
    const json = req.responseFormat ? ctx.fns.models.inference.structured({ action: "instruction", format: req.responseFormat }) : "";
    const system = [req.instructions, json].filter(Boolean).join("\n\n");
    // SDK-resolved reasoning only reaches opted-in providers; auto sends nothing. Off uses the native disable form when
    // declared, else its wire value; without either, off has no representation and is omitted. A concrete on-level uses
    // the native adaptive switch when the resolution carries the flag, and omits the effort value when effort:false.
    const r = req.reasoning && req.reasoning.applied !== "auto" ? req.reasoning : null;
    const reasoningFields = r?.applied === "off" && r.disable ? { thinking: { type: "disabled" } }
        : !r ? {}
        : r.applied === "off" ? (r.wire ? { output_config: { effort: r.wire } } : {})
        : {
            ...(r.adaptive ? { thinking: { type: "adaptive" } } : {}),
            ...(r.effort === false ? {} : { output_config: { effort: r.wire ?? r.applied } }),
        };
    const body: Record<string, unknown> = {
        model: req.model, messages, stream: true,
        ...(opts.endpoint.serverMaxTokens === true ? {} : { max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS }),
        ...(system ? { system } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.tools?.length ? { tools: ctx.fns.models.protocol.anthropic.toTools({ tools: req.tools }) } : {}),
        ...reasoningFields,
        // Provider body extras arrive validated by streamRoute (no protocol-owned keys) and are additive.
        ...(opts.endpoint.body ?? {}),
    };
    const provider = opts.endpoint.provider ?? "anthropic";
    const sensitive = { request: body, secrets: Object.values(opts.endpoint.headers) };
    const res = await ctx.fns.models.protocol.common.streamFetch({ provider, classifyFailure: opts.classifyFailure, fetch: opts.fetch, url: opts.endpoint.base + "/messages", headers: opts.endpoint.headers, body, label, signal });
    let text = "", thinking = "", stop: string | null = null, terminal = false;
    // Native reasoning blocks captured by index: thinking text from thinking_delta, the model signature from
    // signature_delta, and redacted data from the start event. Returned whole as StreamResult.reasoningBlocks.
    const reasoningBlocks: NonNullable<types.models.StreamResult["reasoningBlocks"]> = [];
    const blockByIndex = new Map<string, { type: "thinking" | "redacted_thinking"; thinking?: string; signature?: string; data?: string }>();
    const captureBlock = (ev: Record<string, any>) => {
        const kind = ev.content_block?.type;
        if (kind !== "thinking" && kind !== "redacted_thinking") return;
        const index = String(ev.index ?? 0);
        if (blockByIndex.has(index)) return;
        const block = kind === "thinking" ? { type: kind, thinking: "" } : { type: kind, ...(typeof ev.content_block.data === "string" ? { data: ev.content_block.data } : {}) };
        blockByIndex.set(index, block);
        reasoningBlocks.push(block);
    };
    const captureDelta = (ev: Record<string, any>, d: Record<string, any>) => {
        const block = blockByIndex.get(String(ev.index ?? 0));
        if (!block) return;
        if (d.type === "thinking_delta" && typeof d.thinking === "string" && block.type === "thinking") block.thinking = (block.thinking ?? "") + d.thinking;
        else if (d.type === "signature_delta" && typeof d.signature === "string" && block.type === "thinking") block.signature = (block.signature ?? "") + d.signature;
    };
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
            try { ev = JSON.parse(frame.data); } catch { throw ctx.fns.models.protocol.common.streamInterrupted({ provider, ...sensitive, label, reason: "malformed" }); }
            const type = ev.type ?? frame.event;
            if (type === "error") throw ctx.fns.models.protocol.common.streamInterrupted({ provider, ...sensitive, label, body: ev, reason: "error" });
            if (type === "message_stop") { terminal = true; break; }
            if (type === "message_start") setUsage(ev.message?.usage);
            else if (type === "message_delta") { if (ev.delta?.stop_reason) stop = ev.delta.stop_reason; setUsage(ev.usage); }
            else if (type === "content_block_start" && ev.content_block?.type === "tool_use") tools.start(String(ev.index ?? 0), ev.content_block.id ?? "", ev.content_block.name ?? "");
            else if (type === "content_block_start") captureBlock(ev);
            else if (type === "content_block_delta") {
                const d = ev.delta ?? {};
                if (d.type === "text_delta" && typeof d.text === "string") { text += d.text; req.onEvent?.({ type: "text_delta", delta: d.text }); }
                else if (d.type === "thinking_delta" && typeof d.thinking === "string") { thinking += d.thinking; req.onEvent?.({ type: "thinking_delta", delta: d.thinking, visibility: "public_summary" }); }
                else if (d.type === "input_json_delta" && typeof d.partial_json === "string") tools.append(String(ev.index ?? 0), d.partial_json);
                captureDelta(ev, d);
            }
        }
    } catch (error) {
        if (signal?.aborted || (error && typeof error === "object" && "failure" in error)) throw error;
        throw ctx.fns.models.protocol.common.streamInterrupted({ provider, ...sensitive, label, reason: "ended" });
    }
    if (!terminal) throw ctx.fns.models.protocol.common.streamInterrupted({ provider, ...sensitive, label, reason: "ended" });
    const finishReason = stop === "end_turn" || stop === "stop_sequence" ? "stop" : stop === "max_tokens" ? "length" : stop === "tool_use" ? "tool_calls" : stop;
    const keptBlocks = reasoningBlocks.filter(b => (b.thinking ?? "").length > 0 || (b.signature ?? "").length > 0 || (b.data ?? "").length > 0);
    return { text, thinking, finishReason, usage, toolCalls: tools.finish(), ...(keptBlocks.length ? { reasoningBlocks: keptBlocks } : {}) };
}
