/**
 * Request native transcript compaction and preserve signed continuation data.
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
        req: types.models.CompactRequest;
    },
): Promise<types.models.CompactResult> {
    const { conn, req } = opts;
    const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
    
            const system = [{ type: "text", text: IDENTITY }];
            if (req.instructions.trim()) system.push({ type: "text", text: req.instructions });
            const messages = ctx.fns.llm.toAnthropicMessages({ messages: (req.messages as Record<string, unknown>[]).filter(m => m.role !== "system") });
            const compaction: { type: string; instructions?: string } = { type: "summarize" };
            if (req.focus?.trim()) compaction.instructions = ("Summarize this conversation into a handoff checkpoint so another model can seamlessly continue: goal, progress, decisions, constraints, exact identifiers/paths/errors, and next steps.\n\nFocus: " + req.focus.trim()).slice(0, 16384);
            const body = { model: req.model, max_tokens: req.maxTokens ?? 32000, messages, compaction, system };
            const res = await ctx.fns.models.provider.claude.claudeWireRequest({ conn: conn, path: "/v1/messages", init: { method: "POST", headers: await ctx.fns.models.provider.claude.claudeWireHeaders({ conn: conn, compact: true }), body: JSON.stringify(body), signal: req.signal } });
            const raw = await res.json() as { content?: { type: string; content?: string; signature?: string }[]; stop_reason?: string; usage?: { iterations?: { type: string; input_tokens?: number; output_tokens?: number }[] } };
            const block = raw.content?.find(b => b.type === "compaction");
            if (!block || typeof block.content !== "string" || !block.signature) throw new Error(`anthropic compaction returned no block (stop_reason ${raw.stop_reason})`);
            const iteration = raw.usage?.iterations?.find(i => i.type === "compaction");
            return { item: { type: "compaction", content: block.content, signature: block.signature }, responseId: "", stopReason: String(raw.stop_reason ?? ""), usage: { prompt_tokens: Number(iteration?.input_tokens ?? 0), completion_tokens: Number(iteration?.output_tokens ?? 0) } };
}
