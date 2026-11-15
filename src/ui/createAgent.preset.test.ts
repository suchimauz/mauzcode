import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

test('createAgent defaults to Standard and rejects unknown preset before creation', async () => {
    const ctx = await mkTestCtx();
    const result = await ctx.fns.ui.createAgent({ model: 'mock:test', open: false });
    expect((await ctx.fns.session.load({ id: result.id })).preset.presetId).toBe('standard');
    const before = await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents ORDER BY id' });
    const live = Object.keys(ctx.state.agent);
    await expect(ctx.fns.ui.createAgent({ model: 'mock:test', open: false, presetId: 'nope' })).rejects.toThrow('Unknown agent preset: nope');
    expect(await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents ORDER BY id' })).toEqual(before);
    expect(Object.keys(ctx.state.agent)).toEqual(live);
});
