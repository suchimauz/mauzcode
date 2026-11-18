/**
 * Publish committed trigger changes to live chat state
 *
 * Call only after the transaction commits. Reloads live transcripts so lifecycle entries appear, refreshes the chat stream and emits a scoped `automation` invalidation hint for the trigger panel. Hints carry no data; clients re-read authorized state.
 * @param opts.agentIds Agents whose triggers or lifecycle entries changed.
 * @param opts.reason Short refresh reason for tracing.
 * @param opts.transcript Whether lifecycle entries were appended. @default true
 * @param opts.afterTransaction Called inside a caller-owned transaction without a commit hook: defer until that scope closes, then publish (hints only invalidate; readers reconcile). @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agents whose triggers or lifecycle entries changed. */
        agentIds: string[];
        /** Short refresh reason for tracing. */
        reason: string;
        /** Whether lifecycle entries were appended. @default true */
        transcript?: boolean;
        /** Called inside a caller-owned transaction without a commit hook: defer until that scope closes, then publish. @default false */
        afterTransaction?: boolean;
    },
): Promise<void> {
    const scope = ctx.state.procs?.db?.transactionStorage?.getStore();
    if (opts.afterTransaction && scope?.active) {
        const storage = ctx.state.procs!.db!.transactionStorage!;
        const started = Date.now();
        const later = () => {
            if (scope.active && Date.now() - started < 120_000) { setTimeout(later, 50); return; }
            // Leave the closed transaction context before touching the database again.
            setTimeout(() => storage.exit(() => { void ctx.fns.agent.publishTriggerChange({ agentIds: opts.agentIds, reason: opts.reason, transcript: opts.transcript }); }), 100);
        };
        setTimeout(later, 50);
        return;
    }
    for (const agentId of new Set(opts.agentIds.filter(Boolean))) {
        try {
            if (opts.transcript !== false) {
                const live = ctx.state.agent?.[agentId];
                if (live) await ctx.fns.session.syncAgentState({ agent: live });
                ctx.fns.procs.events.refresh({ topic: `agent:${agentId}`, reason: opts.reason });
            }
            ctx.fns.events.refreshAgentMeta({ agentId, section: 'automation', reason: opts.reason });
        } catch (error) { console.error('Trigger change committed; refresh failed', error); }
    }
}
