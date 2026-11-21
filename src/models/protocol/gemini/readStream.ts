/**
 * Read a Gemini generateContent SSE stream into deltas and a StreamResult
 *
 * Shared by the public gemini protocol and the Code Assist provider. Parses each SSE frame as JSON (with `unwrap`, reads the GenerateContentResponse from the event's `response` field, as Code Assist wraps it), reports text, thought (public_summary) and function-call argument deltas, collects usage (prompt, candidates + thoughts, cached) and returns text, thinking, finishReason (STOP → stop, MAX_TOKENS → length, any function call → tool_calls) and tool calls. A function call part's `thoughtSignature` is returned on that call only; unsigned calls have no signature field. Malformed data, an in-stream error or a stream without a finish reason fail with acceptance uncertain; abort and SDK failures pass through.
 * @param opts.body Readable response body.
 * @param opts.request Streaming request whose onEvent receives deltas.
 * @param opts.label Protocol label used in failure messages.
 * @param opts.signal Optional cancellation signal.
 * @param opts.unwrap Read each event's `response` field instead of the event itself. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Readable response body. */
        body: ReadableStream<Uint8Array>;
        /** Streaming request whose onEvent receives deltas. */
        request: types.models.StreamRequest;
        /** Protocol label used in failure messages. */
        label: string;
        /** Optional cancellation signal. */
        signal?: AbortSignal;
        /** Read each event's `response` field instead of the event itself. @default false */
        unwrap?: boolean;
    },
): Promise<types.models.StreamResult> {
    const { request: req, signal, label } = opts;
    let text = "", thinking = "", finish: string | null = null, calls = 0;
    const usage: types.models.StreamResult["usage"] = {};
    const tools = ctx.fns.models.protocol.common.collectToolCalls({ onEvent: req.onEvent });
    const signatures = new Map<string, string>();
    try {
        for await (const frame of ctx.fns.models.transport.parseSSE({ body: opts.body })) {
            if (!frame.data) continue;
            let raw: Record<string, any>;
            try { raw = JSON.parse(frame.data); } catch { throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "malformed" }); }
            if (raw?.error) throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "error" });
            const ev: Record<string, any> = opts.unwrap ? raw?.response ?? {} : raw;
            if (ev?.error) throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "error" });
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
                    if (typeof part.thoughtSignature === "string" && part.thoughtSignature) signatures.set(slot, part.thoughtSignature);
                }
            }
            if (candidate?.finishReason) finish = String(candidate.finishReason);
        }
    } catch (error) {
        if (signal?.aborted || (error && typeof error === "object" && "failure" in error)) throw error;
        throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "ended" });
    }
    if (finish === null) throw ctx.fns.models.protocol.common.streamInterrupted({ label, reason: "ended" });
    const toolCalls = tools.finish().map((call, i) => {
        const sig = signatures.get(String(i));
        return sig ? { ...call, thoughtSignature: sig } : call;
    });
    const finishReason = toolCalls.length ? "tool_calls" : finish === "STOP" ? "stop" : finish === "MAX_TOKENS" ? "length" : finish.toLowerCase();
    return { text, thinking, finishReason, usage, toolCalls };
}
