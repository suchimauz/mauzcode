/**
 * Convert SDK ordered input into Codex Responses input items
 *
 * SDK-owned Codex mapper: system messages become instructions (last wins); user text/image/PDF-document parts become input_text/input_image; assistant text becomes output_text followed by one function_call per tool call (call id, name, JSON arguments); tool results become function_call_output with attached images as a following user message; CheckpointEntry items become the native compaction item at their exact position. Rejects malformed checkpoints and legacy codex_compaction transcript records with INVALID_INPUT, without echoing encrypted content.
 * @param opts.messages Ordered SDK input: chat messages and checkpoint entries.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Ordered SDK input: chat messages and checkpoint entries. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
    },
): { instructions: string; input: Record<string, unknown>[] } {
    return ctx.fns.models.provider.codex.codexInput(opts);
}
