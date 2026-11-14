/**
 * Request native transcript compaction and preserve signed continuation data.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying scoped credentials and transport. */
        conn: types.models.ResolvedConnection;
        /** Provider operation input with existing callback and cancellation semantics. */
        req: types.models.CompactRequest;
    },
): Promise<types.models.CompactResult> {
    const { conn, req } = opts;
    
            const a = await ctx.fns.models.provider.codex.codexWireAuth({ conn: conn });
            const converted = ctx.fns.models.provider.codex.codexInput({ messages: req.messages });
            const compaction = { trigger: "manual", reason: "user_requested", implementation: "remote", phase: "standalone_turn", strategy: "memento" };
            const turnMetadata = JSON.stringify({ session_id: req.sessionId, thread_id: req.sessionId, turn_id: crypto.randomUUID(), request_kind: "compaction", compaction });
            const body = {
                model: req.model, instructions: req.instructions || converted.instructions, input: [...converted.input, { type: "compaction_trigger" }],
                tools: [], tool_choice: "auto", parallel_tool_calls: false, reasoning: { effort: "medium", summary: "auto" }, store: false, stream: true, include: [],
                client_metadata: { session_id: req.sessionId, thread_id: req.sessionId, "x-codex-turn-metadata": turnMetadata },
            };
            const res = await ctx.fns.models.provider.codex.codexWireResponses({ conn: conn, a: a, sessionId: req.sessionId, body: body, signal: req.signal, extra: { "x-codex-turn-metadata": turnMetadata } });
            if (!res.body) throw ctx.fns.models.provider.codex.codexWireInterrupted({ error: new Error("empty stream"), signal: req.signal });
            const bad = (message: string) => ctx.fns.models.inference.failure({ message, status: 502, info: { code: "PROVIDER_ERROR", classification: "provider", acceptance: "accepted", retryable: false, replaySafe: false } });
            let item: { id?: unknown; encrypted_content?: unknown } | null = null, responseId = "", completed = false;
            const usage = { prompt_tokens: 0, completion_tokens: 0 };
            for await (const ev of ctx.fns.models.provider.codex.codexWireEvents({ body: res.body, signal: req.signal })) {
                if (ev.type === "response.output_item.done" && ev.item?.type === "compaction") { if (item) throw bad("Codex compaction returned multiple checkpoint items"); item = ev.item; }
                else if (ev.type === "response.completed") { completed = true; responseId = typeof ev.response?.id === "string" ? ev.response.id : typeof ev.response_id === "string" ? ev.response_id : ""; usage.prompt_tokens = Number(ev.response?.usage?.input_tokens ?? 0); usage.completion_tokens = Number(ev.response?.usage?.output_tokens ?? 0); break; }
                else if (ev.type === "response.failed" || ev.type === "error") throw ctx.fns.models.provider.codex.codexWireStreamFailed({ ev: ev });
            }
            if (!completed) throw ctx.fns.models.provider.codex.codexWireInterrupted({ error: new Error("no terminal event"), signal: req.signal });
            if (!item || typeof item.encrypted_content !== "string" || !item.encrypted_content) throw bad("Codex compaction returned no valid checkpoint item");
            if (!responseId) throw bad("Codex compaction completed without a response id");
            return { item: { type: "compaction", ...(typeof item.id === "string" && item.id ? { id: item.id } : {}), encrypted_content: item.encrypted_content }, responseId, usage };
}
