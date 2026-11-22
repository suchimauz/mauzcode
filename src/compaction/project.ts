/**
 * Resolve the effective transcript and explain any fallback from a compact checkpoint
 *
 * Use the same projection for request assembly, context estimates and compaction. Honors full versus compact mode, reads only the selected checkpoint, validates its source and tail offsets, and adapts provider-native checkpoints. Missing or incompatible checkpoints return the complete supplied history with a machine-readable fallback reason; no history or metadata is modified.
 * @param opts.model Target provider-qualified model route that will receive the transcript.
 * @param opts.messages Complete ordered history before applying the selected compact checkpoint.
 * @param opts.sleepContext Persisted compact-context metadata including mode, selected revision and generations.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Target provider-qualified model route that will receive the transcript. */
        model: string;
        /** Complete ordered history before applying the selected compact checkpoint. */
        messages: types.session.Message[];
        /** Persisted compact-context metadata including mode, selected revision and generations. */
        sleepContext?: Record<string, unknown> | null;
    },
): Promise<{ messages: types.session.Message[]; mode: "full" | "compact"; fallback: "missing_generation" | "missing_checkpoint" | "incompatible_checkpoint" | "invalid_boundary" | null; revision: number | null; tailStart: number | null; activatedAt: number | null }> {
    const sleep = ctx.fns.agent.normalizeSleepContext({ sleepContext: opts.sleepContext });
    const revision = sleep?.activeRevision ?? null;
    const full = (fallback: "missing_generation" | "missing_checkpoint" | "incompatible_checkpoint" | "invalid_boundary" | null) => ({ messages: opts.messages, mode: "full" as const, fallback, revision, tailStart: null, activatedAt: null });
    if (sleep?.mode !== "compact") return full(null);
    const generation = ctx.fns.agent.getSleepGeneration({ sleepContext: sleep, kind: "active" });
    if (!generation) return full("missing_generation");
    const stored = generation.contextAgentId
        ? await ctx.fns.session.getMessages({ id: String(generation.contextAgentId) })
        : generation.contextMessages;
    if (!Array.isArray(stored) || !stored.length) return full("missing_checkpoint");
    const frontier = Number(generation.sourceOffset ?? generation.sourceFrontier);
    const tailStart = Number(generation.tailStart ?? generation.sourceOffset ?? generation.sourceFrontier);
    const validBoundary = Number.isSafeInteger(frontier) && Number.isSafeInteger(tailStart) && tailStart >= 0 && frontier >= tailStart && frontier <= opts.messages.length;
    let native = false;
    const recover = () => {
        const source = opts.messages.slice(0, frontier);
        // Old checkpoints have no digest. Only trust the original uninterrupted canonical rows,
        // not a same-length suffix, another checkpoint, or an SDK item disguised as history.
        const intact = generation.sourceDigest != null
            ? ctx.fns.compaction.historyDigest({messages: source}) === generation.sourceDigest
            : source.every((m, i) => m.idx === i);
        if (!validBoundary || frontier <= 0 || !intact || opts.messages.some(m => m.message_type === 'codex_compaction' || m.message_type === 'anthropic_compaction' || (m as {type?: string}).type === 'checkpoint')) throw new Error('Codex canonical history is unavailable. Restore complete compatible history or start a new chat.');
        return full('incompatible_checkpoint');
    };
    for (const message of stored) {
        if (message?.message_type !== "codex_compaction") continue;
        native = true;
        let value: types.models.Checkpoint;
        try { value = typeof message.content === "string" ? JSON.parse(message.content) : message.content; }
        catch { throw new Error("Malformed persisted native checkpoint"); }
        if (value?.kind !== 'native-checkpoint' || !value.binding) return recover();
        const route = await ctx.fns.models.resolveRoute({route: opts.model});
        if (route.provider !== 'codex' || !await ctx.fns.models.canReplayCodex({connectionId: route.connectionId, model: route.model, checkpoint: value})) return recover();
    }
    const checkpoint = ctx.fns.compaction.portable({ model: opts.model, producedBy: generation.model, messages: stored });
    if (!checkpoint?.length) return native ? recover() : full("incompatible_checkpoint");
    if (!validBoundary) return native ? recover() : full("invalid_boundary");
    return { messages: [...checkpoint as types.session.Message[], ...opts.messages.slice(tailStart)], mode: "compact", fallback: null, revision, tailStart, activatedAt: Number(generation.activatedAt ?? 0) };
}
