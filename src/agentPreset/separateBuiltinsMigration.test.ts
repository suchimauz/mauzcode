import { describe, expect, test } from 'bun:test';
import { testCtx } from '../$test';
import migration from './$migration_20380105120000_separate_builtin_presets';
import initial from './$migration_20380101120000_agent_presets';
import expansion from './$migration_20380102120000_expand_standard_capabilities';
import native from './$migration_20380103120000_native_agent_tools';
import delegation from './$migration_20380104120000_native_plan_delegation_tools';

// All SQL uses the harness's disposable Postgres, never the working database.
async function fixture() {
    const ctx = await testCtx();
    await ctx.fns.procs.db.run({ sql: 'DELETE FROM agent_presets' });
    return ctx;
}
async function store(ctx: Context, row: types.agentPreset.Preset) {
    await ctx.fns.procs.db.run({
        sql: `INSERT INTO agent_presets (id, name, description, sort_order, builtin, allow, deny, plugins, exclude_sections, prompt, updated_at)
            VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?)`,
        params: [row.id, row.name, row.description, row.sort_order, row.builtin, JSON.stringify(row.allow),
            JSON.stringify(row.deny), JSON.stringify(row.plugins), JSON.stringify(row.exclude_sections), row.prompt, row.updated_at],
    });
}
async function rows(ctx: Context) {
    return await ctx.fns.procs.db.select({ sql: 'SELECT * FROM agent_presets ORDER BY id' });
}
async function bytes(ctx: Context) {
    return await ctx.fns.procs.db.select({ sql: 'SELECT id, row_to_json(agent_presets)::text AS bytes FROM agent_presets ORDER BY id' });
}

describe('forward separation of built-in and custom presets', () => {
    test('empty storage is a no-op and has no automatic destructive down', async () => {
        const ctx = await fixture();
        expect(await migration.up(ctx)).toEqual({ preserved: [] });
        expect(await rows(ctx)).toEqual([]);
        expect('down' in migration).toBe(false);
    });

    test('factory equality treats all rule arrays as sets, ignores timestamps and builtin flag', async () => {
        const ctx = await fixture();
        const original = ctx.state.registry.agentPreset!.defaults!;
        const definitions = ctx.fns.agentPreset.defaults({}).map(row => ({ ...row, deny: ['z', 'a'], exclude_sections: ['two', 'one'] }));
        ctx.state.registry.agentPreset!.defaults = () => structuredClone(definitions);
        try {
            for (const row of definitions) await store(ctx, {
                ...row, builtin: false, updated_at: 123,
                allow: [...row.allow, ...row.allow].reverse(), deny: [...row.deny, ...row.deny].reverse(),
                plugins: [...row.plugins, ...row.plugins].reverse(), exclude_sections: [...row.exclude_sections, ...row.exclude_sections].reverse(),
            });
            expect(await migration.up(ctx)).toEqual({ preserved: [] });
            expect(await rows(ctx)).toEqual([]);
        } finally { ctx.state.registry.agentPreset!.defaults = original; }
    });

    test('every editable field independently causes lossless preservation', async () => {
        const ctx = await fixture();
        const standard = ctx.fns.agentPreset.defaults({})[0]!;
        const changes: Partial<types.agentPreset.Preset>[] = [
            { name: 'My standard' }, { description: 'Private description' }, { sort_order: -99 }, { prompt: 'Private instructions' },
            { allow: ['tools.read'] }, { deny: ['tools.bash'] }, { plugins: ['nrepl', 'openspec'] }, { exclude_sections: ['tools'] },
        ];
        for (const change of changes) {
            await ctx.fns.procs.db.run({ sql: 'DELETE FROM agent_presets' });
            await store(ctx, { ...standard, ...change, builtin: false, updated_at: 1700000000123 });
            const before = (await rows(ctx))[0]!;
            expect(await migration.up(ctx)).toEqual({ preserved: [{ from: 'standard', to: 'standard-custom' }] });
            expect(await rows(ctx)).toEqual([{ ...before, id: 'standard-custom', name: `${before.name} (preserved custom)`, builtin: false }]);
            const after = await bytes(ctx);
            expect(await migration.up(ctx)).toEqual({ preserved: [] });
            expect(await bytes(ctx)).toEqual(after);
        }
    });

    test('observed nrepl/openspec rules survive collisions and diagnostics reveal IDs only', async () => {
        const ctx = await fixture();
        const standard = ctx.fns.agentPreset.defaults({})[0]!;
        const legacy = { ...standard, description: 'Old local setup', allow: ['tools.*', 'nrepl.*'], deny: ['tools.write'],
            plugins: ['nrepl', 'openspec'], exclude_sections: ['hidden'], prompt: 'SECRET PROMPT MUST NOT BE LOGGED', updated_at: 1987 };
        await store(ctx, legacy);
        for (const id of ['standard-custom', 'standard-custom-2']) await store(ctx, { ...standard, id, builtin: false, prompt: id });
        const before = await rows(ctx);
        const log = ctx.state.registry.procs!.log!.info!;
        const messages: unknown[] = [];
        ctx.state.registry.procs!.log!.info = (_ctx: Context, _session: Session | null, opts: unknown) => { messages.push(opts); };
        try {
            expect(await migration.up(ctx)).toEqual({ preserved: [{ from: 'standard', to: 'standard-custom-3' }] });
            expect(await rows(ctx)).toEqual([
                ...before.filter(row => row.id !== 'standard'),
                { ...before[0], id: 'standard-custom-3', name: 'Standard (preserved custom)', builtin: false },
            ]);
            expect(messages).toEqual([{ event: 'agentPreset.preserved', msg: 'standard -> standard-custom-3' }]);
            const after = await bytes(ctx);
            await migration.up(ctx);
            expect(await bytes(ctx)).toEqual(after);
        } finally { ctx.state.registry.procs!.log!.info = log; }
    });

    test('reserved IDs come from defaults, including candidate collisions with unstored code IDs', async () => {
        const ctx = await fixture();
        const standard = ctx.fns.agentPreset.defaults({})[0]!;
        const original = ctx.state.registry.agentPreset!.defaults!;
        ctx.state.registry.agentPreset!.defaults = () => [standard, { ...standard, id: 'standard-custom' }];
        try {
            await store(ctx, { ...standard, prompt: 'customized' });
            expect(await migration.up(ctx)).toEqual({ preserved: [{ from: 'standard', to: 'standard-custom-2' }] });
        } finally { ctx.state.registry.agentPreset!.defaults = original; }
    });

    test('non-reserved legacy flags convert in place; existing custom row bytes stay unchanged', async () => {
        const ctx = await fixture();
        const standard = ctx.fns.agentPreset.defaults({})[0]!;
        await store(ctx, { ...standard, id: 'legacy', updated_at: 111, prompt: 'legacy' });
        await store(ctx, { ...standard, id: 'custom', builtin: false, updated_at: 222, prompt: 'custom' });
        const before = await rows(ctx);
        const customBytes = (await bytes(ctx))[0];
        expect(await migration.up(ctx)).toEqual({ preserved: [] });
        expect(await rows(ctx)).toEqual(before.map(row => ({ ...row, builtin: false })));
        expect((await bytes(ctx))[0]).toEqual(customBytes);
    });

    test('failure after preservation rolls back inserts, deletes and flag conversions without logs', async () => {
        const ctx = await fixture();
        const standard = ctx.fns.agentPreset.defaults({})[0]!;
        await store(ctx, { ...standard, id: 'aaa-legacy', prompt: 'convert first' });
        await store(ctx, { ...standard, prompt: 'preserve second' });
        const before = await bytes(ctx);
        const original = ctx.state.registry.procs!.db!.run!;
        const log = ctx.state.registry.procs!.log!.info!;
        const messages: unknown[] = [];
        ctx.state.registry.procs!.log!.info = (_ctx: Context, _session: Session | null, opts: unknown) => { messages.push(opts); };
        ctx.state.registry.procs!.db!.run = async (c: Context, s: Session | null, opts: { sql: string; params?: unknown[] }) => {
            if (opts.sql.startsWith('DELETE FROM agent_presets WHERE')) throw new Error('injected removal failure');
            return await original(c, s, opts);
        };
        try {
            await expect(migration.up(ctx)).rejects.toThrow('injected removal failure');
            expect(await bytes(ctx)).toEqual(before);
            expect(messages).toEqual([]);
        } finally {
            ctx.state.registry.procs!.db!.run = original;
            ctx.state.registry.procs!.log!.info = log;
        }
        expect((await migration.up(ctx)).preserved).toHaveLength(1);
    });

    test('configured default, existing agent ID and snapshot bytes remain untouched', async () => {
        const ctx = await fixture();
        await ctx.fns.settings.set({ module: 'agentPreset', scopeType: 'global', key: 'default', value: 'standard' });
        const standard = ctx.fns.agentPreset.defaults({})[0]!;
        await store(ctx, { ...standard, plugins: ['nrepl', 'openspec'] });
        await ctx.fns.procs.db.run({ sql: `INSERT INTO agents (id, model, created_at, updated_at, preset_id, preset_snapshot)
            VALUES ('separation-snapshot', 'mock:echo', 1, 1, 'standard', ?::jsonb)`,
            params: [JSON.stringify({ presetId: 'standard', name: 'Old Standard', layers: [{ id: 'standard', allow: ['*'], plugins: ['nrepl'], prompt: 'old' }] })] });
        const read = async () => ({
            agents: await ctx.fns.procs.db.select({ sql: "SELECT id, preset_id, preset_snapshot::text AS snapshot FROM agents WHERE id = 'separation-snapshot'" }),
            settings: await ctx.fns.procs.db.select({ sql: "SELECT row_to_json(settings)::text AS bytes FROM settings WHERE module = 'agentPreset' AND key = 'default'" }),
        });
        const before = await read();
        await migration.up(ctx);
        expect(await read()).toEqual(before);
    });

    test('fresh historical chain ends custom-only and repeated concurrent migration creates one copy', async () => {
        const ctx = await fixture();
        await initial.up(ctx);
        await expansion.up(ctx);
        await native.up(ctx);
        await delegation.up(ctx);
        expect(await migration.up(ctx)).toEqual({ preserved: [] });
        expect(await rows(ctx)).toEqual([]);
        await store(ctx, { ...ctx.fns.agentPreset.defaults({})[0]!, prompt: 'custom' });
        const results = await Promise.all([migration.up(ctx), migration.up(ctx)]);
        expect(results.flatMap(result => result.preserved)).toEqual([{ from: 'standard', to: 'standard-custom' }]);
        expect((await rows(ctx)).map(row => [row.id, row.builtin])).toEqual([['standard-custom', false]]);
    });
});
