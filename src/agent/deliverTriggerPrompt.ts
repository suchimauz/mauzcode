/**
 * Delivers one claimed trigger prompt into its agent conversation
 *
 * Atomically check recipient pause and claim ownership, append the prompt, and schedule its agent. Row locks serialize with Stop and cancellation. A stopped recipient releases the claim back to active without consuming its schedule; false means no delivery.
 * The wake_up event snapshots the locked trigger's kind, cron expression, timezone and watch identifier when present. Historical events are never enriched from mutable trigger rows.
 * @param opts.triggerId Claimed trigger identifier.
 * @param opts.claimToken Unique token proving ownership of the current claim.
 * @param opts.prompt Prompt to insert.
 * @param opts.now Delivery timestamp in milliseconds.
 * @param opts.resultRef Durable predicate result reference, attached only after successful storage.
 * @param opts.resultPreview Bounded predicate preview accompanying a stored reference.
 * @param opts.watchStatus Observed watch evaluation outcome; omitted when unavailable. Never inferred from the prompt or schedule.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Claimed trigger identifier. */
        triggerId: string;
        /** Unique token proving ownership of the current claim. */
        claimToken: string;
        /** Prompt to insert. */
        prompt: string;
        /** Delivery timestamp in milliseconds. */
        now: number;
        /** Durable predicate result reference, attached only after successful storage. */
        resultRef?: types.agent.ResultRef;
        /** Bounded predicate preview accompanying a stored reference. */
        resultPreview?: string;
        /** Observed watch evaluation outcome; omit when unavailable. Recorded only for watch triggers. */
        watchStatus?: 'ready' | 'timeout';
    },
): Promise<boolean | 'coalesced' | 'invalidated'> {
    const append = async () => {
        const row = (await ctx.fns.procs.db.select({ sql: "SELECT agent_id,task_reservation_id FROM agent_triggers WHERE id=?", params: [opts.triggerId] }))[0];
        if (!row) return null;
        const target = (await ctx.fns.procs.db.select({ sql: "SELECT id,stopped_at,archived_at FROM agents WHERE id=? FOR UPDATE", params: [row.agent_id] }))[0];
        const reservation = row.task_reservation_id ? (await ctx.fns.procs.db.select({sql:'SELECT task_state,cancelled_at FROM goal_delegation_reservations WHERE reservation_id=?::uuid FOR UPDATE',params:[row.task_reservation_id]}))[0] : undefined;
        const claim = (await ctx.fns.procs.db.select({ sql: "SELECT id,kind,mode,config,timezone,next_at,task_reservation_id FROM agent_triggers WHERE id=? AND status='checking' AND claim_token=? FOR UPDATE", params: [opts.triggerId, opts.claimToken] }))[0];
        if (!claim) return null;
        if (!target || target.stopped_at != null || target.archived_at != null) {
            await ctx.fns.procs.db.run({ sql: "UPDATE agent_triggers SET status='active',claim_token=NULL,claimed_at=NULL,updated_at=? WHERE id=? AND status='checking' AND claim_token=?", params: [opts.now, opts.triggerId, opts.claimToken] });
            return null;
        }
        const id = String(target.id);
        if (claim.task_reservation_id && (!reservation || reservation.cancelled_at != null || !['open','waiting'].includes(reservation.task_state))) return { outcome:'invalidated' as const };
        const [replay] = await ctx.fns.procs.db.select({sql:'SELECT state FROM agent_trigger_deliveries WHERE trigger_id=? AND firing_key=? FOR UPDATE',params:[claim.id,claim.next_at]});
        if (replay) return { outcome: replay.state === 'invalidated' ? 'invalidated' as const : true as const };
        if (claim.kind === 'cron' || claim.mode === 'edge') {
            const [pending] = await ctx.fns.procs.db.select({sql:"SELECT message_idx FROM agent_trigger_deliveries WHERE trigger_id=? AND state='pending' FOR UPDATE",params:[claim.id]});
            if (pending) return { outcome:'coalesced' as const };
        }
        const message = await ctx.fns.session.appendMessage({ id, clientRequestId:`trigger:${claim.id}:${claim.next_at}`, message: {
            role: 'user', author: null, content: String(opts.prompt) + (claim.kind === 'watch' && opts.watchStatus === 'ready' && opts.resultPreview !== undefined
                ? opts.resultRef ? `\n\nPredicate result preview: ${opts.resultPreview}\nFull result: await ctx.fns.agent.readResult({ id: "${opts.resultRef.id}", offset: 0, limit: 4000 })`
                    : `\n\nPredicate result: ${opts.resultPreview}` : ''),
            result_ref: opts.resultRef, message_type: 'trigger', excluded_from_cursor: false,
        } });
        if (message.duplicate) throw new Error('Trigger submission identity already occupied without its receipt');
        const receipt = await ctx.fns.procs.db.run({sql:"INSERT INTO agent_trigger_deliveries(trigger_id,firing_key,agent_id,message_idx,reservation_id,state,created_at) VALUES(?,?,?,?,?::uuid,'pending',?) ON CONFLICT DO NOTHING",params:[claim.id,claim.next_at,id,message.idx,claim.task_reservation_id ?? null,opts.now]});
        if (receipt.changes !== 1) throw new Error('Trigger receipt identity conflict');
        const config = typeof claim.config === 'string' ? JSON.parse(claim.config) : claim.config;
        await ctx.fns.session.appendEvent({ id, event: {
            type: 'wake_up', reason: opts.prompt, messageIdx: message.idx, triggerId: opts.triggerId,
            ...(typeof claim.kind === 'string' ? { triggerKind: claim.kind } : {}),
            ...(claim.kind === 'cron' && typeof config?.expression === 'string' ? { cronExpression: config.expression } : {}),
            ...(typeof claim.timezone === 'string' ? { timezone: claim.timezone } : {}),
            ...(claim.kind === 'watch' ? { watchId: String(claim.id) } : {}),
            ...(claim.kind === 'watch' && (opts.watchStatus === 'ready' || opts.watchStatus === 'timeout') ? { watchStatus: opts.watchStatus } : {}),
            ...(opts.resultRef ? { resultRef: opts.resultRef, ...(opts.resultPreview !== undefined ? { resultPreview: opts.resultPreview } : {}) } : {}),
        } });
        await ctx.fns.procs.db.run({ sql: "UPDATE agents SET next_run_at=CASE WHEN scratchpad::jsonb#>>'{parked,reason}'='usage_limit' THEN next_run_at ELSE COALESCE(next_run_at,?) END,updated_at=? WHERE id=?", params: [opts.now, opts.now, id] });
        return { agentId:id, outcome:true as const };
    };
    // The dispatcher owns the finalization transaction and refreshes only after commit.
    const inDispatcher = ctx.state.procs?.db?.transactionStorage?.getStore()?.active;
    const result = inDispatcher ? await append() : await ctx.fns.procs.db.transaction({fn:append}) as Awaited<ReturnType<typeof append>>;
    if (!result) return false;
    if (inDispatcher || !('agentId' in result) || !result.agentId) return result.outcome;
    const agentId = result.agentId;
    const live = ctx.state.agent?.[agentId];
    if (live) await ctx.fns.session.syncAgentState({ agent: live });
    ctx.fns.events.refreshAgentMeta({ agentId, section: 'wake', reason: 'trigger-delivered' });
    ctx.fns.agent.wakeWorker({});
    return true;
}
