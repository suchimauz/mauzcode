// Compaction is a model call like any other, and it fails like any other.
//
// The difference is where it runs: inside a hidden child, in the middle of
// someone else's turn, with nothing on screen while it happens. A transport
// blip there used to end the compaction outright, so the transcript stayed
// oversized and the very next turn hit the same wall.
//
// So the same policy that governs agent turns governs these calls too, with
// two compaction-specific rules: the retry budget is per model call (a native
// compaction attempt and each summarization attempt have their own), and the
// wait is cancellable, because the person can compact, stop or switch models at
// any moment and an abandoned wait must not keep firing requests.
//
// While waiting, the parent's live status says so. It is memory only: a retry
// that nobody saw is not a transcript event, and a compaction that eventually
// succeeds should not leave a row behind explaining an interruption that no
// longer exists.
/**
 * Runs one compaction model call, retrying failures the agent retry policy allows.
 *
 * Use around `models.compact` and each summarization model call inside a compactor. Eligibility and
 * delay come from `agent.retryDecision`, so codes that waiting cannot fix (OVERFLOW, AUTH,
 * QUOTA_EXHAUSTED) propagate at once and keep their existing handling. The limit applies per call:
 * each invocation starts with a fresh budget. The wait ends immediately when `signal` aborts, and a
 * transient "retry n/m" status is shown on the source agent while waiting and cleared before the
 * next attempt.
 * @param opts.sessionId Hidden compaction child id; its scratchpad names the source agent.
 * @param opts.provider Provider id for policy overrides.
 * @param opts.call The model call to perform; invoked once per attempt and returns its own type.
 * @param opts.signal Compaction cancellation signal.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Hidden compaction child id; its scratchpad names the source agent. */
        sessionId: string;
        /** Provider id for policy overrides. */
        provider?: string;
        /** The model call to perform; invoked once per attempt and returns its own result type. */
        call: () => Promise<any>;
        /** Compaction cancellation signal. */
        signal?: AbortSignal;
    },
): Promise<any> {
    const sourceAgentId = await resolveSourceAgent({ ctx, sessionId: opts.sessionId });
    for (let attempt = 0; ; attempt++) {
        opts.signal?.throwIfAborted();
        try {
            const result = await opts.call();
            clearStatus({ ctx, agentId: sourceAgentId });
            return result;
        } catch (error: any) {
            opts.signal?.throwIfAborted();
            if (error?.name === 'AbortError') throw error;
            const decision = await ctx.fns.agent.retryDecision({ error, provider: opts.provider, retry: attempt });
            // A parking hint has no meaning inside compaction: there is no durable place
            // to wait here, so the compaction simply fails and the turn reports it.
            if (!decision.retry) { clearStatus({ ctx, agentId: sourceAgentId }); throw error; }
            setStatus({ ctx, agentId: sourceAgentId, attempt: attempt + 1, maxRetries: decision.maxRetries, delayMs: decision.delayMs, code: decision.code });
            try {
                await wait({ delayMs: decision.delayMs, signal: opts.signal });
            } finally {
                clearStatus({ ctx, agentId: sourceAgentId });
            }
        }
    }
}

/** Finds the agent whose UI should show the wait; the hidden child is not on screen. */
async function resolveSourceAgent(opts: { ctx: Context; sessionId: string }): Promise<string | null> {
    const live = (opts.ctx.state as any).agent?.[opts.sessionId];
    const fromLive = live?.scratchpad?.compaction?.sourceAgentId;
    if (typeof fromLive === 'string' && fromLive) return fromLive;
    const rows = await opts.ctx.fns.procs.db.select({
        sql: 'SELECT scratchpad FROM agents WHERE id = ?', params: [opts.sessionId],
    }) as Array<{ scratchpad: string | null }>;
    try { return JSON.parse(String(rows[0]?.scratchpad ?? '{}'))?.compaction?.sourceAgentId ?? null; } catch { return null; }
}

function setStatus(opts: { ctx: Context; agentId: string | null; attempt: number; maxRetries: number; delayMs: number; code: string | null }): void {
    const agent = opts.agentId ? (opts.ctx.state as any).agent?.[opts.agentId] : null;
    if (!agent) return;
    agent.scratchpad ??= {};
    agent.scratchpad.compactionRetry = {
        attempt: opts.attempt, maxRetries: opts.maxRetries, delayMs: opts.delayMs,
        code: opts.code, startedAt: Date.now(),
    };
    notify(opts.ctx, opts.agentId!);
}

function clearStatus(opts: { ctx: Context; agentId: string | null }): void {
    const agent = opts.agentId ? (opts.ctx.state as any).agent?.[opts.agentId] : null;
    if (!agent?.scratchpad?.compactionRetry) return;
    delete agent.scratchpad.compactionRetry;
    notify(opts.ctx, opts.agentId!);
}

function notify(ctx: Context, agentId: string): void {
    try { ctx.fns.procs.events.emit({ topic: `agent:${agentId}:stream`, event: { type: "refresh" } }); } catch { /* the status is cosmetic */ }
}

/** Waits for the backoff, ending at once when the compaction is cancelled. */
function wait(opts: { delayMs: number; signal?: AbortSignal }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const signal = opts.signal;
        if (signal?.aborted) { reject(signal.reason); return; }
        const onAbort = () => { clearTimeout(timer); reject(signal?.reason); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, Math.max(0, opts.delayMs));
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
