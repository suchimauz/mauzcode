import { timingSafeEqual } from 'node:crypto';

/** Reject untrusted Codex opaque input without exposing its contents. Verify against current local generation before auth refresh and again against the immutable dispatch tuple. */
export default async function (
    ctx: Context, _session: Session | null,
    opts: {
        /** Selected connection identity. */
        connectionId: string;
        /** Selected model for checkpoint scope checks at dispatch. */
        model?: string;
        /** Selected chat session for sticky state checks at dispatch. */
        sessionId?: string;
        /** Selected logical run for sticky state checks at dispatch. */
        runId?: string;
        /** Dispatch tuple generation, including explicit null; omit for local preflight. */
        generation?: string | null;
        /** Optional ordered SDK input containing native checkpoint entries. */
        messages?: (Record<string, unknown> | types.models.CheckpointEntry)[];
        /** Optional caller-owned sticky state. */
        state?: types.models.ProviderState;
    },
): Promise<void> {
    const entries = (opts.messages ?? []).filter(m => m?.type === 'checkpoint') as types.models.CheckpointEntry[];
    if (!opts.state && !entries.length) return;
    const generation: string | null = opts.generation !== undefined ? opts.generation : (await ctx.fns.procs.db.select({sql: "SELECT codex_generation FROM llm_connections WHERE id=? AND provider='codex'", params:[opts.connectionId]}))[0]?.codex_generation ?? null;
    const matches = (expected: string | null, supplied: unknown) => !!expected && typeof supplied === 'string' && /^[0-9a-f]{64}$/.test(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
    const invalid = () => ctx.fns.models.inference.failure({ message: 'Codex continuation is unverified or belongs to a different account. Restore complete compatible history or start a new chat.', status: 400, info: { code:'INVALID_INPUT', classification:'invalid_input', acceptance:'none', retryable:false, replaySafe:true } });
    for (const { checkpoint } of entries) {
        if (!checkpoint || checkpoint.connectionId !== opts.connectionId || (opts.model !== undefined && checkpoint.model !== opts.model) || !matches(await ctx.fns.models.provider.codex.codexBindOpaque({generation, checkpoint}), checkpoint.binding)) throw invalid();
    }
    if (opts.state && (opts.state.connectionId !== opts.connectionId || (opts.sessionId !== undefined && (opts.state.sessionId !== opts.sessionId || opts.state.runId !== opts.runId)) || !matches(await ctx.fns.models.provider.codex.codexBindOpaque({generation, state:opts.state}), opts.state.binding))) throw invalid();
}
