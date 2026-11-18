import { describe, expect, test } from 'bun:test';
import { testCtx } from '../$test';
import migration from './$migration_20380106120000_todo_tools';

// All SQL uses the harness's disposable Postgres, never the working database.
async function preset(ctx: Context, id: string, allow: string[], deny: string[] = []) {
    await ctx.fns.procs.db.run({
        sql: `INSERT INTO agent_presets (id, name, description, sort_order, builtin, allow, deny, plugins, exclude_sections, prompt, updated_at)
            VALUES (?, ?, '', 50, false, ?::jsonb, ?::jsonb, '[]'::jsonb, '[]'::jsonb, '', 7)`,
        params: [id, id, JSON.stringify(allow), JSON.stringify(deny)],
    });
}
async function agent(ctx: Context, id: string, layers: Array<{ allow: string[]; deny: string[] }>) {
    const snapshot = { presetId: 'p', name: 'P', layers: layers.map((layer, index) => ({ id: `l${index}`, plugins: [], excludeSections: ['plans'], prompt: '', ...layer })) };
    await ctx.fns.procs.db.run({
        sql: `INSERT INTO agents (id, model, created_at, updated_at, preset_id, preset_snapshot) VALUES (?, 'mock:echo', 1, 1, 'p', ?::jsonb)`,
        params: [id, JSON.stringify(snapshot)],
    });
}
const presets = async (ctx: Context) => Object.fromEntries((await ctx.fns.procs.db.select({ sql: 'SELECT id, allow, deny, updated_at FROM agent_presets ORDER BY id' }) as any[]).map(row => [row.id, row]));
const snapshots = async (ctx: Context) => Object.fromEntries((await ctx.fns.procs.db.select({ sql: 'SELECT id, preset_snapshot FROM agents ORDER BY id' }) as any[]).map(row => [row.id, row.preset_snapshot]));

describe('todo grant migration', () => {
    test('renames exact grants in allow and deny, extends covering wildcards, and is idempotent', async () => {
        const ctx = await testCtx();
        await ctx.fns.procs.db.run({ sql: 'DELETE FROM agent_presets' });
        await preset(ctx, 'exact', ['session.plan', 'session.done', 'session.updatePlan', 'session.removePlan', 'tools.planUpdate', 'tools.planDone', 'session.get*'], ['session.removePlan']);
        await preset(ctx, 'wild', ['session.*', 'tools.*'], ['session.*']);
        await preset(ctx, 'star', ['*'], []);
        await preset(ctx, 'untouched', ['tools.bash'], []);
        await preset(ctx, 'mixed', ['session.plan', 'todo.create'], []);
        await agent(ctx, 'old', [{ allow: ['session.plan', 'tools.planDone'], deny: [] }, { allow: ['*'], deny: ['session.done', 'tools.planUpdate'] }]);
        await agent(ctx, 'clean', [{ allow: ['tools.bash'], deny: [] }]);
        const beforeClean = (await snapshots(ctx)).clean;
        expect(await migration.up(ctx)).toEqual({ presets: 3, snapshots: 1 });
        const rows = await presets(ctx);
        expect(rows.exact.allow).toEqual(['todo.create', 'todo.done', 'todo.update', 'todo.remove', 'tools.todoUpdate', 'tools.todoDone', 'session.get*']);
        expect(rows.exact.deny).toEqual(['todo.remove']);
        expect(rows.wild.allow).toEqual(['session.*', 'tools.*', 'todo.create', 'todo.update', 'todo.done', 'todo.remove']);
        expect(rows.wild.deny).toEqual(['session.*', 'todo.create', 'todo.update', 'todo.done', 'todo.remove']);
        expect(rows.star.allow).toEqual(['*']);
        expect(rows.untouched.allow).toEqual(['tools.bash']);
        expect(rows.mixed.allow).toEqual(['todo.create']);
        expect(Number(rows.untouched.updated_at)).toBe(7);
        const snaps = await snapshots(ctx);
        expect(snaps.old.layers.map((layer: any) => [layer.allow, layer.deny])).toEqual([
            [['todo.create', 'tools.todoDone'], []],
            [['*'], ['todo.done', 'tools.todoUpdate']],
        ]);
        expect(snaps.old.layers[0].excludeSections).toEqual(['plans']);
        expect(snaps.clean).toEqual(beforeClean);
        const once = { rows: await presets(ctx), snaps: await snapshots(ctx) };
        expect(await migration.up(ctx)).toEqual({ presets: 0, snapshots: 0 });
        expect({ rows: await presets(ctx), snaps: await snapshots(ctx) }).toEqual(once);
        expect('down' in migration).toBe(false);
    });

    test('a migrated wildcard deny keeps blocking the todo functions', async () => {
        const ctx = await testCtx();
        await agent(ctx, 'denied', [{ allow: ['*'], deny: ['session.*'] }]);
        await migration.up(ctx);
        const snapshot = (await snapshots(ctx)).denied;
        const allows = ctx.fns.agentPreset.predicate({ snapshot })!;
        for (const name of ['todo.create', 'todo.update', 'todo.done', 'todo.remove']) expect(allows(name)).toBe(false);
        expect(allows('tools.bash')).toBe(true);
    });
});
