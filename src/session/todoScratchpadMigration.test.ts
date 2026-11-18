import { describe, expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';
import migration from './$migration_20380106120000_plan_to_todos';

// All SQL runs against the isolated test Postgres, never the working database.
async function seed(ctx: any, id: string, scratchpad: string, archived = false) {
    await ctx.fns.procs.db.run({
        sql: 'INSERT INTO agents (id, model, scratchpad, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [id, 'test', scratchpad, 1, 1, archived ? 1 : null],
    });
}
async function byId(ctx: any) {
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT id, scratchpad FROM agents ORDER BY id' }) as any[];
    return Object.fromEntries(rows.map(row => [row.id, String(row.scratchpad)]));
}
const boot = (ctx: any) => { ctx.state.procs.lifecycle = { started: [], failed: {} }; ctx.state.agent = {}; delete ctx.state.workerLoopPromise; };

describe('boot-only plan → todos scratchpad migration (isolated Postgres)', () => {
    test('moves each key independently, keeps conflicts and invalid rows, never creates null keys, and is idempotent', async () => {
        const ctx: any = await mkTestCtx();
        boot(ctx);
        const plan = { version: 1, title: 'Work', pausedAt: 5, tasks: [{ id: 'a', status: 'active', elapsedMs: 9, activeSince: null }] };
        await seed(ctx, 'both', JSON.stringify({ plan, planHistory: [{ title: 'old' }], flag: true, n: 1 }));
        await seed(ctx, 'archived', JSON.stringify({ plan }), true);
        await seed(ctx, 'history', JSON.stringify({ planHistory: [{ title: 'only history' }] }));
        await seed(ctx, 'conflict', JSON.stringify({ plan: { title: 'legacy' }, todos: { title: 'current' } }));
        await seed(ctx, 'none', '{"other":1}');
        await seed(ctx, 'broken', '{broken');
        await seed(ctx, 'array', '[{"plan":1}]');
        await migration.up(ctx);
        const first = await byId(ctx);
        expect(JSON.parse(first.both)).toEqual({ todos: plan, todoHistory: [{ title: 'old' }], flag: true, n: 1 });
        expect(JSON.parse(first.archived)).toEqual({ todos: plan });
        expect(JSON.parse(first.history)).toEqual({ todoHistory: [{ title: 'only history' }] });
        expect(JSON.parse(first.conflict)).toEqual({ plan: { title: 'legacy' }, todos: { title: 'current' } });
        expect(first.none).toBe('{"other":1}');
        expect(first.broken).toBe('{broken');
        expect(first.array).toBe('[{"plan":1}]');
        await migration.up(ctx);
        expect(await byId(ctx)).toEqual(first);
    });

    test('down swaps the keys back under the same rule', async () => {
        const ctx: any = await mkTestCtx();
        boot(ctx);
        await seed(ctx, 'a', JSON.stringify({ plan: { title: 'P' }, planHistory: [1] }));
        await seed(ctx, 'b', JSON.stringify({ todos: { title: 'T' }, plan: { title: 'kept' } }));
        await migration.up(ctx);
        await migration.down(ctx);
        const rows = await byId(ctx);
        expect(JSON.parse(rows.a)).toEqual({ plan: { title: 'P' }, planHistory: [1] });
        expect(JSON.parse(rows.b)).toEqual({ todos: { title: 'T' }, plan: { title: 'kept' } });
    });

    test('refuses to run after agents, worker or HTTP have started, without writing', async () => {
        const ctx: any = await mkTestCtx();
        await seed(ctx, 'live', JSON.stringify({ plan: { title: 'P' } }));
        const before = await byId(ctx);
        for (const module of ['agent', 'procs/http']) {
            ctx.state.procs.lifecycle = { started: [module], failed: {} };
            await expect(migration.up(ctx)).rejects.toThrow('boot-only');
        }
        ctx.state.procs.lifecycle = { started: [], failed: {} };
        ctx.state.agent = { live: {} };
        await expect(migration.up(ctx)).rejects.toThrow('boot-only');
        await expect(migration.down(ctx)).rejects.toThrow('boot-only');
        ctx.state.agent = {};
        ctx.state.workerLoopPromise = Promise.resolve();
        await expect(migration.up(ctx)).rejects.toThrow('boot-only');
        expect(await byId(ctx)).toEqual(before);
    });
});
