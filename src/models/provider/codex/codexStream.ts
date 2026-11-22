/**
 * Stream provider inference events while preserving cancellation, usage and tool results.
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
        req: types.models.StreamRequest;
    },
): Promise<types.models.StreamResult> {
    const { conn, req } = opts;
    
            const dispatch = ctx.state.models?.codexDispatch?.get(req);
            if (!dispatch) ctx.fns.models.provider.codex.codexControls({ options: req.providerOptions });
            const messages = structuredClone(req.messages);
            const stateInput = req.state && structuredClone(req.state);
            const a = await ctx.fns.models.provider.codex.codexWireAuth({ conn: conn });
            await ctx.fns.models.provider.codex.codexCheckOpaque({ connectionId: conn.id, generation: a.generation, messages, state: stateInput, model: req.model, sessionId: req.sessionId, runId: req.runId });
            const { input } = ctx.fns.models.provider.codex.codexInput({ messages });
            // models.stream normalizes reasoning for this opted-in provider; direct callers must do the same.
            const applied = req.reasoning?.applied;
            if (!applied) throw ctx.fns.models.inference.failure({ message: "Codex requires SDK-resolved reasoning (call through models.stream)", status: 400, info: { code: "CAPABILITY_UNAVAILABLE", classification: "capability_unavailable", acceptance: "none", retryable: false, replaySafe: true } });
            const body: Record<string, unknown> = {
                model: req.model, store: false, stream: true, instructions: req.instructions, input,
                ...(req.responseFormat ? { text: { format: req.responseFormat.type === "json_schema" ? { type: "json_schema", name: req.responseFormat.name, schema: req.responseFormat.schema, strict: req.responseFormat.strict ?? true } : { type: "json_object" } } } : {}),
                prompt_cache_key: req.promptCacheKey || req.sessionId,
                ...(applied === "auto" ? {} : { reasoning: { effort: applied === "off" ? "none" : applied, summary: "auto" } }),
                ...(req.tools?.length ? { tools: ctx.fns.models.protocol.openaiResponses.toTools({ tools: req.tools }), parallel_tool_calls: true } : {}),
            };
            // Sticky routing: replay the run's first x-codex-turn-state; a new run (or no runId) starts without one.
            const turnState = req.runId && stateInput?.runId === req.runId ? stateInput.data.turnState : undefined;
            const res = await ctx.fns.models.provider.codex.codexWireResponses({ conn: conn, a: a, req, sessionId: req.sessionId, body: body, signal: req.signal, extra: turnState ? { "x-codex-turn-state": turnState } : {} });
            const received = res.headers.get("x-codex-turn-state") || undefined;
            const kept = turnState ?? received;
            let state: types.models.ProviderState | undefined = req.runId && kept
                ? { provider: conn.provider, connectionId: conn.id, sessionId: req.sessionId, runId: req.runId, data: { turnState: kept } }
                : undefined;
            if (state) {
                const binding = await ctx.fns.models.provider.codex.codexBindOpaque({ generation: a.generation, state, issue: true });
                if (binding) state.binding = binding;
                else state = undefined;
            }
            if (!res.body) throw ctx.fns.models.provider.codex.codexWireInterrupted({ error: new Error("empty stream"), signal: req.signal });
            let text = "", thinking = "", finishReason: string | null = null, terminal = false, rateLimits: Record<string, unknown> | null = null;
            const usage: types.models.StreamResult["usage"] = {};
            const toolCalls: types.models.StreamResult["toolCalls"] = [];
            for await (const ev of ctx.fns.models.provider.codex.codexWireEvents({ body: res.body, signal: req.signal })) {
                const t = ev.type;
                if (ev.rate_limits && typeof ev.rate_limits === "object") rateLimits = ev.rate_limits;
                if (t === "response.output_text.delta" && typeof ev.delta === "string") { text += ev.delta; req.onEvent?.({ type: "text_delta", delta: ev.delta }); }
                else if (t === "response.reasoning_summary_text.delta" && typeof ev.delta === "string") { thinking += ev.delta; req.onEvent?.({ type: "thinking_delta", delta: ev.delta, visibility: "public_summary" }); }
                else if (t === "response.function_call_arguments.delta" && typeof ev.delta === "string") req.onEvent?.({ type: "tool_args_delta", delta: ev.delta, ...(typeof ev.item_id === "string" ? { id: ev.item_id } : {}) });
                else if (t === "response.output_item.done" && ev.item?.type === "function_call") toolCalls.push({ id: String(ev.item.call_id ?? ev.item.id), name: String(ev.item.name), args: ctx.fns.models.provider.codex.codexWireParseArgs({ raw: ev.item.arguments }) });
                else if (t === "response.completed" || t === "response.incomplete") {
                    if (ev.response?.rate_limits && typeof ev.response.rate_limits === "object") rateLimits = ev.response.rate_limits;
                    const u = ev.response?.usage;
                    if (u) { usage.prompt_tokens = u.input_tokens; usage.completion_tokens = u.output_tokens; if (u.input_tokens_details?.cached_tokens !== undefined) usage.cache_read_tokens = u.input_tokens_details.cached_tokens; }
                    const status = ev.response?.status;
                    finishReason = status === "completed" ? (toolCalls.length ? "tool_calls" : "stop") : status === "incomplete" ? "length" : status ?? null;
                    if (ev.response?.incomplete_details?.reason === "max_output_tokens") finishReason = "length";
                    terminal = true;
                    break;
                } else if (t === "response.failed" || t === "error") throw ctx.fns.models.provider.codex.codexWireStreamFailed({ ev: ev });
            }
            if (!terminal) throw ctx.fns.models.provider.codex.codexWireInterrupted({ error: new Error("no terminal event"), signal: req.signal });
            const quota = ctx.fns.models.provider.codex.codexQuota({ headers: res.headers, rateLimits });
            return { text, thinking, finishReason, usage, toolCalls, ...(state ? { state } : {}), ...(quota ? { quota } : {}) };
}
