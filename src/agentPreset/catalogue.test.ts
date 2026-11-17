import { expect, test } from 'bun:test';
import { testCtx } from '../$test';
import start from './$start';

test('effective catalogue ignores reserved shadows, sorts deterministically and returns independent values without writes', async () => {
    const ctx = await testCtx();
    await ctx.fns.procs.db.run({ sql: 'DELETE FROM agent_presets' });
    for (const id of ['z-custom', 'a-custom']) await ctx.fns.agentPreset.create({ preset: { id, name: id, sort_order: 10, allow: ['tools.read'] } });
    await ctx.fns.procs.db.run({ sql: `INSERT INTO agent_presets (id, name, builtin, plugins, prompt, updated_at) VALUES ('standard', 'Stale', false, '["nrepl"]'::jsonb, 'stale', 1), ('minimal', 'Stale minimal', true, '[]'::jsonb, 'stale', 1), ('legacy-builtin', 'Legacy', true, '[]'::jsonb, '', 1)` });
    const stored = await ctx.fns.procs.db.select({ sql: 'SELECT * FROM agent_presets ORDER BY id' });
    const select = ctx.state.registry.procs.db.select;
    const run = ctx.state.registry.procs.db.run;
    ctx.state.registry.procs.db.run = async () => { throw new Error('Unexpected write'); };
    ctx.state.registry.procs.db.select = async (c: Context, s: Session | null, opts: { sql: string; params?: any }) => {
        expect(opts.sql.trim().startsWith('SELECT ')).toBe(true);
        return select(c, s, opts);
    };
    try {
        const list = await ctx.fns.agentPreset.list({});
        expect(list.map(p => p.id)).toEqual(['a-custom', 'standard', 'z-custom', 'creator', 'minimal']);
        for (const builtin of ctx.fns.agentPreset.defaults({})) {
            expect(await ctx.fns.agentPreset.get({ id: builtin.id })).toEqual(builtin);
            expect(await ctx.fns.agentPreset.reset({ id: builtin.id })).toEqual(builtin);
        }
        expect(await ctx.fns.agentPreset.get({ id: 'legacy-builtin' })).toBeNull();
        list[0]!.allow.push('changed.*');
        list.find(p => p.id === 'standard')!.plugins.push('changed');
        const builtin = (await ctx.fns.agentPreset.get({ id: 'standard' }))!;
        builtin.allow.length = 0;
        const custom = (await ctx.fns.agentPreset.get({ id: 'a-custom' }))!;
        custom.allow.length = 0;
        expect((await ctx.fns.agentPreset.get({ id: 'a-custom' }))?.allow).toEqual(['tools.read']);
        expect(await ctx.fns.agentPreset.get({ id: 'standard' })).toEqual(ctx.fns.agentPreset.defaults({})[0]!);
        await ctx.fns.agentPreset.ensureBuiltins({});
        await start(ctx, null, {});
        expect(await ctx.fns.procs.db.select({ sql: 'SELECT * FROM agent_presets ORDER BY id' })).toEqual(stored);
    } finally {
        ctx.state.registry.procs.db.select = select;
        ctx.state.registry.procs.db.run = run;
    }
    await expect(ctx.fns.agentPreset.update({ id: 'legacy-builtin', patch: { name: 'Changed' } })).rejects.toThrow('Unknown');
    expect(await ctx.fns.agentPreset.remove({ id: 'legacy-builtin' })).toBe(false);
});
