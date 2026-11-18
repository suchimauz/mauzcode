/**
 * Make one active trigger due now for normal engine processing
 *
 * Shared run-now / check-now operation for the inspector form, chat panel, /trigger and agent tools. Only an active row of the given agent becomes due; the worker alone claims and evaluates it, so a watch check may stay false and a paused recipient runs after resume. Never invokes the predicate or injects a prompt, and never reports a firing. Outcomes: `scheduled`, `deferred_paused` (made due while the recipient is paused), `already_checking`, `not_active`.
 * @param opts.id Owning agent identifier.
 * @param opts.triggerId Trigger identifier of that agent.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owning agent identifier. */
        id: string;
        /** Trigger identifier of that agent. */
        triggerId: string;
    },
): Promise<{ outcome: 'scheduled' | 'deferred_paused' | 'already_checking' | 'not_active'; triggerId: string; kind?: string }> {
    const apply = async () => {
        const [agent] = await ctx.fns.procs.db.select({ sql: 'SELECT stopped_at,archived_at FROM agents WHERE id=? FOR UPDATE', params: [opts.id] });
        const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT id,kind,status FROM agent_triggers WHERE id=? AND agent_id=? FOR UPDATE', params: [opts.triggerId, opts.id] });
        if (!agent || agent.archived_at != null || !row) return { outcome: 'not_active' as const, triggerId: opts.triggerId };
        if (row.status === 'checking') return { outcome: 'already_checking' as const, triggerId: opts.triggerId, kind: String(row.kind) };
        if (row.status !== 'active') return { outcome: 'not_active' as const, triggerId: opts.triggerId, kind: String(row.kind) };
        const now = Date.now();
        const changed = await ctx.fns.procs.db.run({ sql: "UPDATE agent_triggers SET next_at=LEAST(COALESCE(next_at,?),?),updated_at=? WHERE id=? AND agent_id=? AND status='active'", params: [now, now, now, opts.triggerId, opts.id] });
        if (changed.changes !== 1) return { outcome: 'not_active' as const, triggerId: opts.triggerId, kind: String(row.kind) };
        return { outcome: agent.stopped_at != null ? 'deferred_paused' as const : 'scheduled' as const, triggerId: opts.triggerId, kind: String(row.kind) };
    };
    const inTransaction = ctx.state.procs?.db?.transactionStorage?.getStore()?.active;
    const result = inTransaction ? await apply() : await ctx.fns.procs.db.transaction({ fn: apply }) as Awaited<ReturnType<typeof apply>>;
    if (!inTransaction && (result.outcome === 'scheduled' || result.outcome === 'deferred_paused')) {
        ctx.fns.agent.wakeWorker({});
        await ctx.fns.agent.publishTriggerChange({ agentIds: [opts.id], reason: 'trigger-run-now', transcript: false });
    }
    return result;
}
