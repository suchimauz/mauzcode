/**
 * Stream provider inference events while preserving cancellation, usage and tool results.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
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
    const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
    
            ctx.fns.models.inference.rejectProviderOptions({ provider: "claude", providerOptions: req.providerOptions });
            const instructions = req.instructions.startsWith(IDENTITY) ? req.instructions.slice(IDENTITY.length).trimStart() : req.instructions;
            const bootstrap = instructions ? [{ role: "user", content: instructions }, { role: "assistant", content: "Understood. Ready to act." }] : [];
            // Claude does not declare checkpoints, so models.stream never passes checkpoint entries here.
            const convo = [...bootstrap, ...(req.messages as Record<string, unknown>[]).filter(m => m.role !== "system")];
            const cacheableMessageCount = (req.cacheableMessageCount ?? req.messages.length) + bootstrap.length;
            const messages = ctx.fns.models.protocol.anthropic.toAnthropicMessages({ messages: convo, cacheableMessageCount });
            const mark = (message: typeof messages[number] | undefined) => {
                const block = message?.content?.[message.content.length - 1];
                if (block && typeof block === "object") block.cache_control = { type: "ephemeral" };
            };
            if (messages.length > 2 && messages[1]?.role === "assistant") mark(messages[1]);
            const body: Record<string, unknown> = { model: req.model, system: IDENTITY, messages, stream: true, max_tokens: 16384 };
            const reasoning = await ctx.fns.models.inference.resolveReasoningEffort({ model: req.model, effort: req.reasoningEffort as types.models.ReasoningLevel | "auto" ?? "auto" });
            if (reasoning.mode === "anthropic-adaptive" && reasoning.applied !== "auto") {
                if (reasoning.applied !== "off") { body.thinking = { type: "adaptive" }; body.output_config = { effort: reasoning.applied === "xhigh" ? "max" : reasoning.applied }; }
                else if (!/(opus|sonnet|haiku|fable)-5/.test(req.model)) body.thinking = { type: "disabled" };
            }
            if (req.tools?.length) body.tools = ctx.fns.models.protocol.anthropic.toTools({ tools: req.tools });
            if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
            // Anthropic rejects a custom temperature while extended thinking is enabled.
            if (req.temperature !== undefined && (body.thinking as { type?: string } | undefined)?.type !== "adaptive") body.temperature = req.temperature;
            const h = await ctx.fns.models.provider.claude.claudeWireHeaders({ conn: conn });
            if (messages[0]?.content?.[0]?.type === "compaction") h["anthropic-beta"] += ",compact-2026-09-04";
            const res = await ctx.fns.models.provider.claude.claudeWireRequest({ conn: conn, path: "/v1/messages", init: { method: "POST", headers: h, body: JSON.stringify(body), signal: req.signal } });
            let text = "", thinking = "", stop: string | null = null, terminal = false;
            const usage: types.models.StreamResult["usage"] = {};
            const slots = new Map<number, { id: string; name: string; buf: string }>();
            const setUsage = (u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined) => {
                if (!u) return;
                if (u.output_tokens != null) usage.completion_tokens = u.output_tokens;
                if (u.input_tokens != null || u.cache_read_input_tokens != null || u.cache_creation_input_tokens != null) {
                    usage.prompt_tokens = u.input_tokens == null ? undefined : u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
                    usage.cache_read_tokens = u.cache_read_input_tokens; usage.cache_write_tokens = u.cache_creation_input_tokens;
                }
            };
            try {
                if (!res.body) throw new Error("Claude response has no stream body");
                for await (const frame of ctx.fns.models.transport.parseSSE({ body: res.body })) {
                    if (!frame.data || frame.data === "[DONE]") continue;
                    const ev = JSON.parse(frame.data);
                    const type = ev.type ?? frame.event;
                    if (type === "error") await ctx.fns.models.provider.claude.claudeWireFailure({ conn: conn, body: JSON.stringify(ev), h: res.headers, request: body, secrets: [...Object.values(h), (h.authorization ?? "").replace(/^Bearer /i, "")] });
                    else if (type === "message_stop") terminal = true;
                    else if (type === "message_start") setUsage(ev.message?.usage);
                    else if (type === "message_delta") { if (ev.delta?.stop_reason) stop = ev.delta.stop_reason; setUsage(ev.usage); }
                    else if (type === "content_block_start" && ev.content_block?.type === "tool_use") slots.set(Number(ev.index ?? 0), { id: ev.content_block.id ?? "", name: ev.content_block.name ?? "", buf: "" });
                    else if (type === "content_block_delta") {
                        const d = ev.delta ?? {};
                        if (d.type === "text_delta" && typeof d.text === "string") { text += d.text; req.onEvent?.({ type: "text_delta", delta: d.text }); }
                        else if (d.type === "thinking_delta" && typeof d.thinking === "string") { thinking += d.thinking; req.onEvent?.({ type: "thinking_delta", delta: d.thinking, visibility: "public_summary" }); }
                        else if (d.type === "input_json_delta" && typeof d.partial_json === "string") {
                            const slot = slots.get(Number(ev.index ?? 0));
                            if (slot) { slot.buf += d.partial_json; req.onEvent?.({ type: "tool_args_delta", delta: d.partial_json, id: slot.id }); }
                        }
                    }
                }
                if (!terminal) throw new Error("Anthropic stream ended without message_stop");
            } catch (error) {
                if (req.signal?.aborted || error && typeof error === "object" && "failure" in error) throw error;
                const code = error instanceof SyntaxError ? "PROXY_PROTOCOL" : "PROXY_CONNECTION_LOST";
                // A stream line that will not parse is, in practice, a connection cut in the
                // middle of a chunk — the same loss as a closed socket, and equally worth a
                // retry. SOCKS negotiation errors that share this code stay non-retryable at
                // their own source (socksProxy.connect).
                const diagnostic = ctx.fns.models.inference.providerDiagnostic({ provider: 'claude', stage: 'stream' });
                throw Object.assign(new Error(diagnostic.summary), { diagnostic, code, retryable: true, noFallback: true });
            }
            const toolCalls = [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => {
                let args: unknown = {};
                if (s.buf.trim()) { try { args = JSON.parse(s.buf); } catch { args = { __unparsed: s.buf }; } }
                return { id: s.id, name: s.name, args };
            });
            await ctx.fns.models.provider.claude.claudeWireRecordHeaders({ conn: conn, h: res.headers });
            return { text, thinking, finishReason: stop === "end_turn" || stop === "stop_sequence" ? "stop" : stop === "max_tokens" ? "length" : stop, usage, toolCalls };
}
