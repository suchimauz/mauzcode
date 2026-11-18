/**
 * Evaluates and finalizes one claimed durable agent trigger
 *
 * Process a claimed trigger with one-shot time, cron, once/edge watches, timeouts, audit history and bounded retries. Stopped recipients skip evaluation; in-flight work rechecks pause before delivery/finalization and preserves the pending schedule.
 * @param opts.triggerId Claimed trigger identifier.
 * @param opts.claimToken Claim ownership token.
 * @param opts.now Evaluation timestamp; defaults to now.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Claimed trigger identifier. */
        triggerId: string;
        /** Claim ownership token. */
        claimToken: string;
        /** Evaluation timestamp; defaults to now. */
        now?: number;
    },
): Promise<{ outcome: string }> {
    const now = Math.floor(opts.now ?? Date.now());
    const [row] = await ctx.fns.procs.db.select({sql:"SELECT * FROM agent_triggers WHERE id=? AND status='checking' AND claim_token=?",params:[opts.triggerId,opts.claimToken]});
    if (!row) return {outcome:'missing'};
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
    const interval = Math.max(5000, Number(config?.everyMs ?? 300000));
    let outcome = 'waiting', status = 'active', lastReady = !!row.last_ready;
    let result: unknown = null, error: string | null = null, prompt: string | null = null, nextAt: number | null = null;
    // A claim may predate Stop. Do not start predicates for a paused recipient.
    const recipient = (await ctx.fns.procs.db.select({ sql: 'SELECT stopped_at,archived_at FROM agents WHERE id=?', params: [row.agent_id] }))[0];
    if (!recipient || recipient.stopped_at != null || recipient.archived_at != null) {
        await ctx.fns.procs.db.run({ sql: "UPDATE agent_triggers SET status='active',claim_token=NULL,claimed_at=NULL,updated_at=? WHERE id=? AND status='checking' AND claim_token=?", params: [now, row.id, opts.claimToken] });
        return { outcome: 'paused' };
    }
    try {
        if (row.kind === 'at') {
            outcome = 'fired'; prompt = row.prompt; status = 'completed';
        } else if (row.kind === 'cron') {
            outcome = 'fired'; prompt = row.prompt;
            nextAt = await ctx.fns.agent.nextCronAt({expression:String(config.expression),timezone:String(row.timezone),after:now});
        } else if (row.timeout_at != null && now >= Number(row.timeout_at)) {
            outcome = 'timed_out'; status = 'timed_out'; prompt = config.onTimeoutPrompt ? String(config.onTimeoutPrompt) : null;
        } else {
            const checked = await ctx.fns.agent.watchPredicate({predicate:String(config.predicate),opts:config.opts ?? {}});
            result = checked.result ?? null;
            const ready = !!checked.ready;
            if (ready && (row.mode === 'once' || !lastReady)) { outcome = 'fired'; prompt = row.prompt; }
            else if (!ready && lastReady) outcome = 'rearmed';
            if (ready && row.mode === 'once') status = 'completed';
            else nextAt = now + interval;
            lastReady = ready;
        }
    } catch (cause) {
        outcome = 'error'; error = String(cause instanceof Error ? cause.message : cause).slice(0,1000);
        prompt = null;
        nextAt = now + Math.min(15*60000, 60000 * 2 ** Math.min(Number(row.attempts ?? 0),4));
    }
    let resultJson: string;
    let resultRef: types.agent.ResultRef | undefined;
    let resultPreview: string | undefined;
    try {
        const full = JSON.stringify(result ?? null) ?? "null";
        const prepared = await ctx.fns.resultStore.prepare({ownerAgentId:String(row.agent_id),kind:"trigger:"+row.id,text:full,inlineLimit:16_000});
        resultRef = prepared.ref;
        const preview = (prepared.truncated ? prepared.preview : full).toWellFormed();
        resultPreview = prepared.storageError !== undefined ? `${preview}\nFull result unavailable: storage failed` : preview;
        resultJson = prepared.truncated ? JSON.stringify({truncated:true,originalChars:prepared.originalChars,preview,...(prepared.storageError !== undefined ? {storageError:"Full result unavailable: storage failed"} : {})}) : full;
    } catch {
        resultPreview = "[unserializable result]\nFull result unavailable: serialization failed";
        resultJson = JSON.stringify({truncated:true,preview:"[unserializable result]",storageError:"Full result unavailable: serialization failed"});
    }
    const committed = await ctx.fns.procs.db.transaction({fn:async () => {
        // Predicates can finish after Stop; retain due time/readiness so resume
        // re-evaluates rather than silently consuming a once/edge watch.
        const target = (await ctx.fns.procs.db.select({ sql: 'SELECT stopped_at,archived_at FROM agents WHERE id=? FOR UPDATE', params: [row.agent_id] }))[0];
        if (!target || target.stopped_at != null || target.archived_at != null) {
            await ctx.fns.procs.db.run({ sql: "UPDATE agent_triggers SET status='active',claim_token=NULL,claimed_at=NULL,updated_at=? WHERE id=? AND status='checking' AND claim_token=?", params: [now, row.id, opts.claimToken] });
            return { outcome: 'paused' };
        }
        if (row.task_reservation_id) await ctx.fns.procs.db.select({sql:'SELECT reservation_id FROM goal_delegation_reservations WHERE reservation_id=?::uuid FOR UPDATE',params:[row.task_reservation_id]});
        if (prompt) {
            const ready = row.kind === 'watch' && outcome === 'fired';
            const delivered = await ctx.fns.agent.deliverTriggerPrompt({triggerId:row.id,claimToken:opts.claimToken,prompt,now,
                resultRef: ready ? resultRef : undefined, resultPreview: ready ? resultPreview : undefined,
                watchStatus:ready ? 'ready' : row.kind==='watch' && outcome==='timed_out' ? 'timeout' : undefined});
            if (!delivered) return {outcome:'cancelled'};
            if (delivered === 'coalesced') outcome = 'coalesced';
            if (delivered === 'invalidated') { outcome = 'invalidated'; status = 'cancelled'; nextAt = null; }
        }
        const final=await ctx.fns.procs.db.run({sql:"UPDATE agent_triggers SET status=?,next_at=?,last_ready=?,attempts=attempts+1,last_error=?,claim_token=NULL,claimed_at=NULL,updated_at=?,finished_at=CASE WHEN ? IN ('completed','timed_out') THEN ? ELSE finished_at END WHERE id=? AND status='checking' AND claim_token=?",params:[status,nextAt,lastReady,error,now,status,now,row.id,opts.claimToken]});
        if(final.changes===0)return{outcome:"cancelled"};
        await ctx.fns.procs.db.run({sql:"INSERT INTO agent_trigger_runs(trigger_id,scheduled_at,outcome,result,result_ref,error,created_at) VALUES(?,?,?,?::jsonb,?::jsonb,?,?) ON CONFLICT DO NOTHING",params:[row.id,Number(row.next_at??now),outcome,resultJson,resultRef?JSON.stringify(resultRef):null,error,now]});
        if (row.task_reservation_id && outcome === 'timed_out' && !prompt) {
            await ctx.fns.agent.reconcileTriggerWait({reservationId:row.task_reservation_id,reason:'watch_timed_out',now});
        }
        return{outcome};
    }}) as { outcome: string };
    if (prompt && (committed.outcome === 'fired' || committed.outcome === 'timed_out')) {
        const live = ctx.state.agent?.[row.agent_id];
        if (live) await ctx.fns.session.syncAgentState({agent:live});
        ctx.fns.events.refreshAgentMeta({agentId:row.agent_id,section:'wake',reason:'trigger-delivered'});
        ctx.fns.agent.wakeWorker({});
    }
    return committed;
}
