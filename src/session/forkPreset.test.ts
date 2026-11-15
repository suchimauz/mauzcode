import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

test('fork inherits independent rules and Creator cannot widen Standard', async () => {
    const ctx = await mkTestCtx();
    const parent = await ctx.fns.agent.start({ model: 'mock:test' });
    const inherited = await ctx.fns.session.fork({ id: parent.id });
    expect(inherited.preset).toEqual(parent.preset);
    expect(inherited.preset).not.toBe(parent.preset);
    const child = await ctx.fns.session.fork({ id: parent.id, presetId: 'creator' });
    expect(child.preset.layers).toHaveLength(2);
    expect(ctx.fns.agentPreset.allows({ snapshot: child.preset, name: 'procs.repl.load' })).toBe(false);
    expect(ctx.fns.agentPreset.allows({ snapshot: child.preset, name: 'tools.read' })).toBe(true);
    expect((await ctx.fns.session.load({ id: child.id })).preset).toEqual(child.preset);
});

test('delegation paths pass narrower preset through forks and fresh-context creation', async () => {
    const ctx = await mkTestCtx();
    ctx.state.registry.agent.wakeWorker = () => {};
    ctx.state.registry.agent.run = async () => {};
    const parent = await ctx.fns.agent.start({ model: 'mock:test' });
    const delegated = await ctx.fns.agent.delegate({ agent: parent, presetId: 'minimal', title: 'Task', tasks: [{ id: 'one', title: 'One' }] });
    const fresh = await ctx.fns.agent.delegateTask({ parent, presetId: 'minimal', task: 'Task', mode: 'async', forkContext: false });
    const forked = await ctx.fns.agent.delegateTask({ parent, presetId: 'minimal', task: 'Task', mode: 'async', forkContext: true });
    await ctx.fns.procs.db.run({ sql: 'INSERT INTO kv (key, value) VALUES (?, ?)', params: ['shared-agent:' + parent.id, JSON.stringify({ name: 'Source' })] });
    const shared = await ctx.fns.sharedAgent.delegate({ agentId: parent.id, presetId: 'minimal', task: 'Task' });
    for (const id of [delegated.id, fresh.childId, forked.childId, shared.childId]) {
        const child = await ctx.fns.session.load({ id });
        expect(child.preset.layers.map((layer: types.agentPreset.Layer) => layer.id)).toEqual(['standard', 'minimal']);
        expect(ctx.fns.agentPreset.allows({ snapshot: child.preset, name: 'tools.eval' })).toBe(false);
    }
});
