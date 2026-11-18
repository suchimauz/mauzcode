/** Finish task for the runtime.  * @param opts.agent Agent whose state is read or updated.
 * @param opts.summary Concise summary of completed work or compacted context.
 * @param opts.result Required JSON-compatible result returned to the parent and stored on the final completed todo.
 * @param opts.wakeParent Whether to queue the parent after task completion.
*/
export default async function (
    ctx: Context,
    _session: Session | null,
// Mark a delegated task as finished and notify the parent if awaiting

        /**
  * Completes a delegated task, stores the result, and wakes the parent if in await mode.
  */
    opts: {
        /** Live agent instance to operate on. */
    agent: types.agent.Agent;
        /** Concise summary of the operation or result. */
    summary: string;
        /** Required JSON-compatible result stored on the final completed todo. */
    result: any;
        /** Wake parent used by the operation. */
    wakeParent?: boolean },
): Promise<{ ok: true; parentId: string | null; summary: string; waiterFound: boolean }> {
    const { agent } = opts;
    const currentMeta = agent.scratchpad?.delegation ?? agent.scratchpad?.delegateTask;
    if (!currentMeta || typeof currentMeta !== "object") throw new Error("finishTask: missing delegation metadata");
    const summary = String(opts?.summary ?? "").trim();
    if (!summary) throw new Error("finishTask: summary is required");
    if (opts.result === undefined || opts.result === null) throw new Error("finishTask: result is required");
    const parentId = currentMeta.parentId ? String(currentMeta.parentId) : null;
    const finishedAt = Date.now();
    const updated: any = await ctx.fns.procs.db.transaction({ fn: async () => {
    // Read the immutable required marker under the delivery lock. Ordinary
    // delegations do not depend on Goal tables (including pre-migration installs).
    const [owner] = await ctx.fns.procs.db.select({sql:"SELECT run_token,to_jsonb(a)->>'goal_delegation_required' AS required FROM agents a WHERE id=? FOR UPDATE",params:[agent.id]});
    if (owner?.required === 'true') {
        const [task] = await ctx.fns.procs.db.select({sql:'SELECT reservation_id,task_state FROM goal_delegation_reservations WHERE source_agent_id=? FOR UPDATE',params:[agent.id]});
        if (!task || task.task_state === 'cancelled') throw new Error('finishTask: task missing or cancelled');
        await ctx.fns.goal.delegationEndTriggers({reservationIds:[String(task.reservation_id)]});
        // A running claim still needs its final accounting receipt. Settlement reads
        // the committed completion below; a waiting/blocked task has no claim to settle.
        if (owner.run_token == null || task.task_state === 'waiting' || task.task_state === 'blocked') {
            await ctx.fns.procs.db.run({sql:"UPDATE goal_delegation_reservations SET task_state='closed',closed_at=COALESCE(closed_at,?),close_reason='terminal',retry_from_run_id=NULL,blocked_reason=NULL,blocked_at=NULL WHERE reservation_id=?::uuid",params:[finishedAt,task.reservation_id]});
        }
    }
    const saved: any = await ctx.fns.session.mutateScratchpad({ id: agent.id, mutate: (scratchpad: Record<string, any>) => {
        const delegated = !!scratchpad.delegation;
        const meta = scratchpad.delegation ?? scratchpad.delegateTask;
        if (!meta || typeof meta !== "object") throw new Error("finishTask: missing delegation metadata");
        const terminal = delegated ? meta.status === "ready" : meta.status === "finished";
        if (terminal) return { alreadyFinished: true, meta };
        if (delegated) {
            const tasks = Array.isArray(scratchpad?.todos?.tasks) ? scratchpad.todos.tasks : [];
            const finalTask = [...tasks].reverse().find((task: any) => task.status === "done");
            if (!finalTask || tasks.some((task: any) => task.status !== "done")) {
                throw new Error("finishTask: delegated todos must be fully completed before finishing");
            }
            finalTask.result = opts.result;
            finalTask.resultSummary = summary;
            finalTask.resultAt = finishedAt;
            scratchpad.todos.updatedAt = finishedAt;
        }
        const finished = { summary, result: opts.result, finishedAt };
        meta.status = delegated ? "ready" : "finished";
        meta.summary = summary;
        meta.result = finished;
        if (delegated) scratchpad.delegation = meta;
        else scratchpad.delegateTask = meta;
        return { alreadyFinished: false, meta };
    } });
    // Result and immutable completion outbox commit together. No recipient lock:
    // enqueue-only avoids child/parent lock inversion; delivery obtains it later.
    const savedMeta = saved.result.meta;
    if (agent.parentId && savedMeta.result?.finishedAt) {
        const brief = String(savedMeta.summary ?? summary).trim().slice(0, 4000);
        const key = `completion:${agent.id}:${savedMeta.result.finishedAt}`;
        const text = '<team-update member="' + agent.id + '" event="todos.completed">Agent ' + agent.id + ' todos.completed. ' + brief + '</team-update>';
        const payload = JSON.stringify({ key, text, author: 'agent:' + agent.id, messageType: 'team_update', wake: true,
            event: { type: 'team_update', event: 'todos.completed', memberId: agent.id, taskId: null, taskTitle: null, summary: brief } });
        await ctx.fns.procs.db.run({ sql: 'INSERT INTO session_inbound_deliveries(agent_id,delivery_key,payload,created_at) VALUES(?,?,?,?) ON CONFLICT(agent_id,delivery_key) DO NOTHING', params: [String(agent.parentId), key, payload, Date.now()] });
    }
    return saved;
    } });
    agent.scratchpad = updated.scratchpad;
    const meta = updated.result.meta;
    if (updated.result.alreadyFinished) {
        await ctx.fns.session.syncAgentState?.({ agent });
        // Repair a crash between durable result persistence and notification enqueue.
        if (agent.parentId) await ctx.fns.agent.steer({ from: agent, event: 'todos.completed', summary: String(meta.summary ?? summary) });
        return { ok: true, parentId, summary: String(meta.summary ?? summary), waiterFound: false };
    }
    await ctx.fns.session.syncAgentState?.({ agent });
    const waiters = (((ctx.state as any).delegateTaskWaiters) ??= new Map());
    if (agent.parentId) {
        await ctx.fns.agent.steer({ from: agent, event: "todos.completed", summary });
        ctx.fns.events.refreshAgentMeta({ agentId: String(agent.parentId), section: "team", reason: "team-finished" });
    }
    const waiter = meta.mode === "await" ? waiters.get(agent.id) : null;
    if (waiter?.resolve) {
        waiter.resolve({ childId: agent.id, summary, result: opts.result });
        waiters.delete(agent.id);
        return { ok: true, parentId, summary, waiterFound: true };
    }
    return { ok: true, parentId, summary, waiterFound: false };
}
