import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

test('preset edit grants a plugin only to agents created afterwards', async () => {
    const ctx = await mkTestCtx();
    ctx.state.registry.agentPreset.origin = (_c: Context, _s: Session | null, opts: { name: string }) => opts.name.startsWith('redmine.') ? { kind: 'plugin', plugin: 'redmine' } : { kind: 'core' };
    const first = await ctx.fns.ui.createAgent({ model: 'mock:test', open: false });
    const a = await ctx.fns.session.load({ id: first.id });
    expect(a.preset?.presetId).toBe('standard');
    expect(a.preset?.layers[0]?.plugins).toEqual(['openspec', 'git', 'websearch', 'browser', 'gh', 'terminal', 'glab']);
    for (const name of ['projects.list', 'projects.get', 'planning.enter', 'input.request']) {
        expect(ctx.fns.agentPreset.allows({ snapshot: a.preset, name })).toBe(true);
    }
    for (const name of ['projects.create', 'projects.remove', 'projects.update', 'projects.chats']) {
        expect(ctx.fns.agentPreset.allows({ snapshot: a.preset, name })).toBe(false);
    }
    const snapshot = structuredClone(a.preset);
    await ctx.fns.agentPreset.update({ id: 'standard', patch: { plugins: ['redmine'] } });
    const second = await ctx.fns.ui.createAgent({ model: 'mock:test', open: false });
    const b = await ctx.fns.session.load({ id: second.id });
    expect(ctx.fns.agentPreset.allows({ snapshot: a.preset, name: 'redmine.myIssues' })).toBe(false);
    expect(ctx.fns.agentPreset.allows({ snapshot: b.preset, name: 'redmine.myIssues' })).toBe(true);
    expect((await ctx.fns.session.load({ id: a.id })).preset).toEqual(snapshot);
});

test('deleting a custom preset leaves both agents usable through their stored snapshots', async () => {
    const ctx = await mkTestCtx();
    await ctx.fns.agentPreset.create({ preset: { id: 'custom-reader', name: 'Reader', allow: ['tools.read'] } });
    const a = await ctx.fns.ui.createAgent({ model: 'mock:test', presetId: 'custom-reader', open: false });
    const b = await ctx.fns.ui.createAgent({ model: 'mock:test', presetId: 'custom-reader', open: false });
    const original = (await ctx.fns.session.load({ id: a.id })).preset;
    await ctx.fns.agentPreset.remove({ id: 'custom-reader' });
    for (const id of [a.id, b.id]) {
        const loaded = await ctx.fns.session.load({ id });
        expect(loaded.preset).toEqual(original);
        expect(ctx.fns.agentPreset.allows({ snapshot: loaded.preset, name: 'tools.read' })).toBe(true);
        expect(ctx.fns.agentPreset.allows({ snapshot: loaded.preset, name: 'tools.bash' })).toBe(false);
        await ctx.fns.session.save({ agent: loaded });
        expect((await ctx.fns.session.load({ id })).preset).toEqual(original);
    }
    await expect(ctx.fns.ui.createAgent({ model: 'mock:test', presetId: 'custom-reader', open: false })).rejects.toThrow('Unknown agent preset');
});
