import { describe, expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

describe('creation-time preset persistence', () => {
    test('round trip preserves snapshot and subsequent saves cannot switch it', async () => {
        const ctx = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: 'mock:test' });
        const original = structuredClone(agent.preset);
        expect(original?.presetId).toBe('standard');
        expect((await ctx.fns.session.load({ id: agent.id }))?.preset).toEqual(original);
        agent.preset = await ctx.fns.agentPreset.resolve({ id: 'creator' });
        await ctx.fns.session.save({ agent });
        expect((await ctx.fns.session.load({ id: agent.id }))?.preset).toEqual(original);
    });

    test('missing legacy snapshot uses shipped Creator and warns', async () => {
        const ctx = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: 'mock:test' });
        await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET preset_id = NULL, preset_snapshot = NULL WHERE id = ?', params: [agent.id] });
        await ctx.fns.procs.db.run({ sql: `INSERT INTO agent_presets (id, name, builtin, allow, updated_at) VALUES ('creator', 'Stale Creator', true, '[]'::jsonb, 1) ON CONFLICT (id) DO UPDATE SET allow = '[]'::jsonb` });
        const warnings: object[] = [];
        ctx.state.registry.procs.log.warn = (_c: Context, _s: Session | null, opts: object) => { warnings.push(opts); };
        const loaded = await ctx.fns.session.load({ id: agent.id });
        expect(loaded?.preset?.presetId).toBe('creator');
        expect(loaded?.preset?.layers[0].allow).toEqual(['*']);
        expect(warnings).toHaveLength(1);
    });
});
