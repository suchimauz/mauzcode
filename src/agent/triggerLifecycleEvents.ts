/**
 * Append display-only trigger lifecycle entries to the owning chat
 *
 * Internal; call inside the transaction that commits the transition so a rollback leaves no entry. Records a safe snapshot (ID, kind, purpose, cron schedule, cause, creator) as a `trigger_lifecycle` event: no model message, no wake, no predicate configuration or results. Publish refreshes after commit with agent.publishTriggerChange.
 * @param opts.agentId Agent owning the triggers.
 * @param opts.transition Committed lifecycle transition.
 * @param opts.rows Trigger rows changed by the transition.
 * @param opts.cause What caused the transition. @default manual
 * @param opts.creatorAgentId Creating agent when it differs from the owner.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent owning the triggers. */
        agentId: string;
        /** Committed lifecycle transition. */
        transition: 'created' | 'cancelled' | 'expired';
        /** Trigger rows changed by the transition. */
        rows: { id: string; kind: string; prompt: string; config?: unknown; timezone?: string | null; next_at?: number | string | null }[];
        /** What caused the transition. @default manual */
        cause?: 'manual' | 'bulk' | 'task' | 'timeout' | 'agent' | 'form';
        /** Creating agent when it differs from the owner. */
        creatorAgentId?: string | null;
    },
): Promise<void> {
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Trigger lifecycle entries require the transition transaction');
    let creatorTitle: string | null = null;
    if (opts.creatorAgentId && opts.creatorAgentId !== opts.agentId) {
        const [creator] = await ctx.fns.procs.db.select({ sql: 'SELECT title FROM agents WHERE id=?', params: [opts.creatorAgentId] });
        creatorTitle = typeof creator?.title === 'string' && creator.title.trim() ? creator.title.trim().slice(0, 120) : null;
    }
    for (const row of opts.rows) {
        const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config as Record<string, unknown> | null | undefined;
        await ctx.fns.session.appendEvent({ id: opts.agentId, event: {
            type: 'trigger_lifecycle', transition: opts.transition, triggerId: String(row.id), triggerKind: String(row.kind),
            purpose: ctx.fns.agent.triggerPurpose({ prompt: String(row.prompt ?? '') }), cause: opts.cause ?? 'manual',
            ...(row.kind === 'cron' && typeof config?.expression === 'string' ? { cronExpression: config.expression } : {}),
            ...(row.kind === 'cron' && typeof row.timezone === 'string' ? { timezone: row.timezone } : {}),
            ...(opts.transition === 'created' && row.next_at != null ? { nextAt: Number(row.next_at) } : {}),
            ...(opts.creatorAgentId && opts.creatorAgentId !== opts.agentId ? { creatorAgentId: opts.creatorAgentId, ...(creatorTitle ? { creatorTitle } : {}) } : {}),
        } });
    }
}
