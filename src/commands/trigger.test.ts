import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

test('/trigger is a catalogued human request: bare and argument forms, replay, conflicts, unchanged planning', async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: 'mock:test' });
    expect((await ctx.fns.commands.list({})).map((c: any) => c.name)).toEqual(['plan', 'compact', 'trigger']);
    expect(await ctx.fns.commands.parse({ text: '/trigger' })).toEqual({ name: 'trigger', args: '' });
    expect(await ctx.fns.commands.parse({ text: '/trigger  in 20 minutes check the build ' })).toEqual({ name: 'trigger', args: 'in 20 minutes check the build' });
    expect(await ctx.fns.commands.parse({ text: '/plan off' })).toEqual({ name: 'plan', args: 'off' });
    await ctx.fns.procs.db.run({ sql: "INSERT INTO agent_planning(agent_id,mode,revision,proposal,updated_at) VALUES (?,'plan',2,'{\"status\":\"pending\"}'::jsonb,?)", params: [agent.id, Date.now()] });
    const first = await ctx.fns.commands.dispatch({ agentId: agent.id, text: '/trigger in 20 minutes check the build', requestId: 'k' });
    expect(first).toMatchObject({ ok: true, command: 'trigger', scheduled: true });
    const replay = await ctx.fns.commands.dispatch({ agentId: agent.id, text: '/trigger in 20 minutes check the build', requestId: 'k' });
    expect(replay).toMatchObject({ duplicate: true, messageIdx: first.messageIdx });
    await expect(ctx.fns.commands.dispatch({ agentId: agent.id, text: '/trigger cancel it', requestId: 'k' })).rejects.toThrow('reused');
    const messages = await ctx.fns.session.getMessages({ id: agent.id });
    expect(messages.filter((m: any) => m.role === 'user')).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'user', content: '/trigger in 20 minutes check the build' });
    expect(messages[0].message_type ?? 'message').toBe('message');
    const [planning] = await ctx.fns.procs.db.select({ sql: "SELECT mode,revision,proposal->>'status' AS status FROM agent_planning WHERE agent_id=?", params: [agent.id] });
    expect(planning).toEqual({ mode: 'plan', revision: 2, status: 'pending' });
    expect((await ctx.fns.agent.armedTriggers({ id: agent.id })).triggers).toHaveLength(0);
    const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT next_run_at FROM agents WHERE id=?', params: [agent.id] });
    expect(row.next_run_at).not.toBeNull();
    const bare = await ctx.fns.commands.dispatch({ agentId: agent.id, text: '/trigger', requestId: 'bare' });
    expect(bare).toMatchObject({ ok: true, scheduled: true });
    const events = (await ctx.fns.session.getEvents({ id: agent.id })).filter((e: any) => e.type === 'user');
    expect(events.at(-1).command).toMatchObject({ name: 'trigger', text: '/trigger', argsText: '' });
});

test('agent capability derives one identity from the accepted command across clarification', async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: 'mock:test' });
    const made = await ctx.fns.agent.wake({ id: agent.id, inMs: 3_600_000, prompt: 'Daily report' });
    await ctx.fns.commands.dispatch({ agentId: agent.id, text: '/trigger cancel the report', requestId: 'cmd1' });
    // Same derivation tools.call uses: the calling agent comes from the injected session.
    const callCtx = Object.create(ctx); callCtx.session = { kind: 'agent', agentId: agent.id };
    const apply = (opts: any) => callCtx.fns.agent.applyTriggerAction(opts);
    const first = await apply({ triggerId: made.id, action: 'cancel' });
    expect(first).toMatchObject({ outcome: 'cancelled', kind: 'at', purpose: 'Daily report' });
    // After a clarification turn the same intent replays rather than acting twice.
    expect(await apply({ triggerId: made.id, action: 'cancel' })).toMatchObject({ outcome: 'cancelled', duplicate: true });
    const lifecycle = (await ctx.fns.session.getEvents({ id: agent.id })).filter((e: any) => e.type === 'trigger_lifecycle' && e.transition === 'cancelled');
    expect(lifecycle).toHaveLength(1);
});
