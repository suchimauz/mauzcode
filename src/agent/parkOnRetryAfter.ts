// When a provider says "not before then", the honest answer is to wait, not to fail.
//
// A Retry-After longer than the policy's maximum backoff is not a delay worth
// sitting through inside a turn, and retrying before it only earns another
// rejection. So the agent parks: it keeps its unread messages (the run cursor
// never advanced), gets one durable wake at the hinted moment, and continues
// the same work by itself.
//
// Only THIS agent parks. Rate limits can be per request or per key as often as
// per account, and parking a whole credential group would stop agents that are
// not throttled at all.
/**
 * Parks one agent until a provider's Retry-After moment and wakes it automatically.
 *
 * Use from the worker when a model error carries `parkUntil`. Marks the agent parked with reason
 * `retry_after`, schedules one durable wake at that moment plus small jitter, clears the pending
 * run and the retry counter, and emits a `parked` event. Nothing is broken, so no error is
 * recorded: the transcript later shows an `unparked` entry instead. The cap keeps a wild hint
 * bounded; after the wake the request is simply sent again.
 * @param opts.id Agent to park.
 * @param opts.parkUntil Absolute epoch ms at which the request may be repeated. @minimum 1
 * @param opts.code Machine code of the failure that asked for the wait.
 * @param opts.provider Provider id of the throttled connection.
 * @param opts.message Safe human-readable reason, shown in the parking card.
 * @param opts.now Current time in ms, for testing. @default Date.now()
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Agent to park. */
        id: string;
        /** Absolute epoch ms at which the request may be repeated. @minimum 1 */
        parkUntil: number;
        /** Machine code of the failure that asked for the wait. */
        code?: string | null;
        /** Provider id of the throttled connection. */
        provider?: string | null;
        /** Safe human-readable reason, shown in the parking card. */
        message?: string;
        /** Current time in ms, for testing. @default Date.now() */
        now?: number;
    },
): Promise<{ id: string; parked: boolean; wakeAt: number }> {
    const now = Math.floor(opts.now ?? Date.now());
    const id = opts.id;
    // The decision already capped the wait, but never trust a caller-supplied instant
    // to keep an agent asleep for a day.
    const at = Math.min(Math.floor(opts.parkUntil), now + 30 * 60_000) + (hash(id) % 3000);
    const reason = `${opts.provider ? `${opts.provider}: ` : ''}provider asked to wait — continue the interrupted work`;
    const message = opts.message ?? 'The provider asked to wait before the next request';

    const row = (await ctx.fns.procs.db.select({
        sql: 'SELECT id, model, wake_at, wake_reason FROM agents WHERE id = ? AND archived_at IS NULL AND stopped_at IS NULL',
        params: [id],
    }))[0];
    if (!row) return { id, parked: false, wakeAt: at };

    const updated = await ctx.fns.session.mutateScratchpad({
        id,
        mutate: (scratchpad: Record<string, any>) => {
            const already = scratchpad.parked ?? null;
            scratchpad.parked = {
                reason: 'retry_after',
                provider: opts.provider ?? null,
                account: null,
                model: String(row.model ?? ''),
                planType: null,
                resetsAt: Math.floor(opts.parkUntil),
                wakeAt: at,
                parkedAt: now,
                message,
                // Only one time alarm exists per agent; remember a user's own wake so
                // unpark can put it back instead of swallowing it.
                previousWake: already?.previousWake ?? (row.wake_at ? { at: Number(row.wake_at), reason: String(row.wake_reason ?? '') } : null),
            };
        },
    });

    await ctx.fns.procs.db.run({
        sql: 'UPDATE agents SET wake_at = ?, wake_reason = ?, next_run_at = NULL, last_error = NULL, llm_retry_attempt = 0, llm_retry_pending = NULL, updated_at = ? WHERE id = ? AND archived_at IS NULL',
        params: [at, reason, now, id],
    });

    const live = (ctx.state as any).agent?.[id];
    if (live) {
        live.scratchpad = updated.scratchpad;
        live.wakeAt = at;
        live.wakeReason = reason;
    }

    await ctx.fns.session.appendEvent({
        id,
        event: {
            type: 'parked', reason: 'retry_after', provider: opts.provider ?? null, account: null,
            planType: null, resetsAt: Math.floor(opts.parkUntil), wakeAt: at, message,
            ...(opts.code ? { code: opts.code } : {}),
        },
    });
    ctx.fns.events.refreshAgentMeta({ agentId: id, section: 'wake', reason: 'parked' });
    return { id, parked: true, wakeAt: at };
}

function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
}
