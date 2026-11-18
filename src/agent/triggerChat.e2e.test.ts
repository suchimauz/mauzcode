import { expect, test } from 'bun:test';
import { mkModelsTestCtx } from './modelsTestCtx.entry';

// End to end through the registered HTTP routes on an isolated database: create via /trigger,
// inspect counts, check/run, cancel from the chat panel, then "reload" and compare panel,
// transcript and audit with engine state. Only the signed-in user and CSRF verifier are stubbed.
test('chat trigger surfaces agree with engine state after create, run, check, cancel and reload', async () => {
    const ctx: any = await mkModelsTestCtx();
    ctx.fns.agent.syncPlanningContext = async () => {};
    ctx.state.registry.auth.currentUser = async () => ({ required: true, user: { id: 'u', disabledAt: null } });
    ctx.state.registry.auth.verifyCsrf = async (_c: any, _s: any, { token }: any) => token === 'csrf';
    const path = `.mauzcode/tmp/e2e-${crypto.randomUUID()}`;
    ctx.state.registry.repl.eval = async (c: any, _s: any, o: { code: string; agent?: any }) => {
        const fns = c.fns.agentPreset.guardFns({ snapshot: o.agent.preset });
        const id = o.agent.id;
        const made = o.code === 'wake' ? await fns.agent.wake({ id, inMs: 20 * 60_000, prompt: 'check the build' })
            : await fns.agent.watch({ id, predicate: 'file.exists', opts: { path }, prompt: 'Artifact ready', everyMs: 3_600_000 });
        return JSON.stringify(made);
    };
    const agent = await ctx.fns.agent.start({ model: 'mock/default:test' });
    await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET created_by=? WHERE id=?', params: ['u', agent.id] });
    const http = async (method: string, url: string, body?: unknown) => {
        const response = await ctx.fns.procs.http.dispatch({ method, url, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf' } } : {}) });
        return { status: response.status, json: await response.json() };
    };
    const poll = async (now: number) => {
        const pending: Promise<any>[] = []; const original = ctx.fns.agent.processTrigger;
        ctx.fns.agent.processTrigger = (_c: any, _s: any, opts: any) => { const work = original(opts); pending.push(work); return work; };
        try { await ctx.fns.agent.pollTriggers({ now }); await Promise.all(pending); } finally { ctx.fns.agent.processTrigger = (_c: any, _s: any, opts: any) => original(opts); }
    };

    // Create via the command: one accepted human turn, the agent creates two triggers through eval.
    agent.scratchpad.mockLLM = { turns: [{ toolCalls: [{ id: 'c1', name: 'eval', args: { code: 'wake' } }] }, { toolCalls: [{ id: 'c2', name: 'eval', args: { code: 'watch' } }] }, { text: 'Готово.' }] };
    await ctx.fns.session.save({ agent });
    const accepted = await http('POST', `/agent/${agent.id}/commands`, { text: '/trigger in 20 minutes check the build; watch the artifact', requestId: 'cmd' });
    expect(accepted.json).toMatchObject({ ok: true, command: 'trigger', scheduled: true });
    await ctx.fns.session.syncAgentState({ agent });
    await ctx.fns.agent.run({ agent, userText: '', userMessageAlreadyAppended: true });

    let panel = (await http('GET', `/agent/${agent.id}/triggers`)).json;
    expect(panel.counts).toEqual({ at: 1, cron: 0, watch: 1 });
    expect(panel.triggers.map((t: any) => t.kind)).toEqual(['watch', 'at']);
    const [watch, wake] = panel.triggers;

    // Check now: the false watch is checked by the worker without a firing.
    expect((await http('POST', `/agent/${agent.id}/triggers/${watch.id}/actions`, { requestId: 'check', action: 'run' })).json).toMatchObject({ outcome: 'scheduled', kind: 'watch' });
    await poll(Date.now() + 5);
    // Run now: the wake fires once through normal delivery.
    expect((await http('POST', `/agent/${agent.id}/triggers/${wake.id}/actions`, { requestId: 'run', action: 'run' })).json).toMatchObject({ outcome: 'scheduled', kind: 'at' });
    await poll(Date.now() + 5);
    // Cancel the remaining watch from the panel; a lost-response retry changes nothing more.
    expect((await http('POST', `/agent/${agent.id}/triggers/${watch.id}/actions`, { requestId: 'cancel', action: 'cancel' })).json).toMatchObject({ outcome: 'cancelled' });
    expect((await http('POST', `/agent/${agent.id}/triggers/${watch.id}/actions`, { requestId: 'cancel', action: 'cancel' })).json).toMatchObject({ outcome: 'cancelled', duplicate: true });

    // Reload: fresh reads of every surface.
    delete ctx.state.agent[agent.id];
    panel = (await http('GET', `/agent/${agent.id}/triggers`)).json;
    const engine = await ctx.fns.procs.db.select({ sql: 'SELECT id,status FROM agent_triggers WHERE agent_id=? ORDER BY id', params: [agent.id] });
    expect(panel.triggers).toEqual([]);
    expect(engine.filter((row: any) => ['active', 'checking'].includes(row.status))).toEqual([]);
    expect(Object.fromEntries(engine.map((row: any) => [row.id, row.status]))).toEqual({ [watch.id]: 'cancelled', [wake.id]: 'completed' });

    const { events } = (await http('GET', `/api/v1/agents/${agent.id}/events?limit=200`)).json;
    const lifecycle = events.filter((e: any) => e.type === 'trigger_lifecycle').map((e: any) => [e.lifecycle.transition, e.lifecycle.triggerId]);
    expect(lifecycle).toEqual([['cancelled', watch.id]]); // creations are badged on their visible eval cards
    expect(events.filter((e: any) => e.type === 'tool_call').flatMap((e: any) => (e.createdTriggers ?? []).map((t: any) => t.id)).sort()).toEqual([watch.id, wake.id].sort());
    expect(events.filter((e: any) => e.type === 'wake_up').map((e: any) => e.lifecycle.triggerId)).toEqual([wake.id]);

    const watchAudit = (await http('GET', `/agent/${agent.id}/trigger/${watch.id}`)).json;
    expect(watchAudit.trigger.status).toBe('cancelled');
    expect(watchAudit.runs.map((r: any) => r.outcome)).not.toContain('fired');
    const wakeAudit = (await http('GET', `/agent/${agent.id}/trigger/${wake.id}`)).json;
    expect(wakeAudit.runs.filter((r: any) => r.outcome === 'fired')).toHaveLength(1);
});
