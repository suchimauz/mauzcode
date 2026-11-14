// Provider-neutral compaction selected for every stored model connection.
// Native failure never falls back. Text summaries retain overflow trimming.

const SUMMARIZATION_PROMPT = `You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.

Include:
- Current progress and key decisions made
- Important context, constraints, or user preferences
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue
- Exact identifiers, file paths, commands and errors that matter

Recent messages after this summary will be preserved verbatim. Do not repeat runtime/system instructions. Do not continue the task.
Be concise, structured, and focused on helping the next LLM seamlessly continue the work.`;

const SUMMARY_PREFIX = "Another language model started to solve this problem and produced a summary of its thinking process. You also have access to the state of the tools that were used by that language model. Use this to build on the work that has already been done and avoid duplicating work. Here is the summary produced by the other language model, use the information in this summary to assist with your own analysis:";

const OVERFLOW = /context_length_exceeded|request_too_large|prompt is too long|exceeds the context|exceeded model token limit|maximum context length|\b413\b/i;

/**
 * Compact through the resolved connection's native capability or a text handoff.
 * Native failures propagate unchanged; only non-native summary overflow trims history.
 * @param opts.model Stored provider/account:model route.
 * @param opts.sessionId Stable compaction child id for provider correlation.
 * @param opts.instructions Effective system instructions for native compaction.
 * @param opts.focus Optional handoff guidance to preserve in either path.
 * @param opts.messages Effective ordered transcript, including tool calls and results.
 * @param opts.signal Cancellation signal forwarded to either model operation.
 */
export default async function (ctx: Context, _session: Session | null, opts: Parameters<types.compaction.Compactor>[2]): Promise<types.compaction.CompactionResult> {
    opts.signal?.throwIfAborted();
    const route = await ctx.fns.models.resolveRoute({ route: opts.model });
    if (route.nativeCompaction) {
        const result = await ctx.fns.models.compact({
            connectionId: route.connectionId, model: route.model,
            sessionId: opts.sessionId, instructions: opts.instructions,
            messages: opts.messages, focus: opts.focus, signal: opts.signal,
        });
        opts.signal?.throwIfAborted();
        const item = result.item;
        // Persist existing transcript markers by payload shape, not provider identity.
        // Protocol converters and portable projection already replay these verbatim.
        if (item?.type === "compaction" && "encrypted_content" in item && typeof item.encrypted_content === "string" && item.encrypted_content) {
            return { message: { role: "user", content: JSON.stringify(item), message_type: "codex_compaction" }, summary: `Native server checkpoint · ${result.responseId}` };
        }
        if (item?.type === "compaction" && "content" in item && typeof item.content === "string" && item.content.trim() && typeof item.signature === "string" && item.signature) {
            return { message: { role: "user", content: JSON.stringify(item), message_type: "anthropic_compaction" }, summary: item.content };
        }
        throw new Error("native compaction returned an invalid checkpoint");
    }
    const system = SUMMARIZATION_PROMPT + (opts.focus?.trim() ? "\n\nFocus instructions: " + opts.focus.trim() : "");
    let history = [...opts.messages];
    for (;;) {
        opts.signal?.throwIfAborted();
        try {
            const call = await ctx.fns.models.call({ connectionId: route.connectionId, model: route.model, sessionId: opts.sessionId, signal: opts.signal, system, user: JSON.stringify(history) });
            opts.signal?.throwIfAborted();
            const summary = String(call.text ?? "").trim();
            if (!summary) throw new Error("compaction summary was empty");
            return { message: { role: "user", content: SUMMARY_PREFIX + "\n" + summary, message_type: "compaction_summary" }, summary };
        } catch (error: any) {
            opts.signal?.throwIfAborted();
            const code = error?.failure?.code ?? error?.code;
            // Structured failure metadata wins over text: never trim quota/auth errors
            // just because their human-readable message happens to mention context.
            const overflow = code != null ? code === "OVERFLOW" : OVERFLOW.test(String(error?.message ?? error));
            if (!overflow || history.length <= 1) throw error;
            // Trim from the beginning (keeps the recent, most relevant part) and
            // never leave a tool result without the call that produced it.
            history = history.slice(1);
            while (history.length > 1 && history[0]?.role === "tool") history = history.slice(1);
            ctx.fns.procs.log.warn({ event: "compaction.overflow-trim", msg: `dropped oldest item, ${history.length} left` });
        }
    }
}
